import {
  aave,
  chainlink,
  deltaNeutralGmxVaults,
  gmxProtocol,
  NetworkName,
  tokens,
} from "@ragetrade/sdk";
import { BigNumber, ethers } from "ethers";
import { formatEther, formatUnits } from "ethers/lib/utils";
import { getProviderAggregate } from "../../providers";
import { days, mins } from "../../utils";
import { juniorVault } from "../aggregated/util/events";
import { getLogsInLoop, price } from "../aggregated/util/helpers";
import { parallelize } from "../aggregated/util/parallelize";

export async function perInterval2(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);
  const { gmxUnderlyingVault, glpManager } = gmxProtocol.getContractsSync(
    networkName,
    provider
  );
  const allWhitelistedTokensLength = (
    await gmxUnderlyingVault.allWhitelistedTokensLength()
  ).toNumber();
  const allWhitelistedTokens: string[] = [];
  for (let i = 0; i < allWhitelistedTokensLength; i++) {
    allWhitelistedTokens.push(await gmxUnderlyingVault.allWhitelistedTokens(i));
  }
  const { weth, wbtc, fsGLP, glp } = tokens.getContractsSync(
    networkName,
    provider
  );

  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName);
  const { aUsdc } = aave.getContractsSync(networkName, provider);
  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress);
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress);

  const { ethUsdAggregator } = chainlink.getContractsSync(
    networkName,
    provider
  );

  // LINK / USD: https://arbiscan.io/address/0x86E53CF1B870786351Da77A57575e79CB55812CB
  // UNI / USD: https://arbiscan.io/address/0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720

  const linkUsdAggregator = ethUsdAggregator.attach(
    "0x86E53CF1B870786351Da77A57575e79CB55812CB"
  );
  const uniUsdAggregator = ethUsdAggregator.attach(
    "0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720"
  );

  // const startBlock = 27679448; // Oct 1
  // const endBlock = 50084140; // Dec 31
  const startBlock = 50084140; // Oct 1
  const endBlock = await provider.getBlockNumber();
  const interval = 2000; // 497; // Math.floor(((endBlock - startBlock) * 3 * mins) / days);

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: () => {
        const events = [];
        for (let i = startBlock; i <= endBlock; i += interval) {
          events.push({
            blockNumber: i,
          });
        }
        return events as ethers.Event[];
      },
      ignoreMoreEventsInSameBlock: true,
    },
    async (_i, blockNumber) => {
      const block = await provider.getBlock(blockNumber);

      const usdgAmounts = await Promise.all(
        allWhitelistedTokens.map((token) =>
          gmxUnderlyingVault.usdgAmounts(token, { blockTag: blockNumber })
        )
      );

      const wethUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(weth.address, {
            blockTag: blockNumber,
          })
        )
      );
      const wbtcUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(wbtc.address, {
            blockTag: blockNumber,
          })
        )
      );

      const totalUsdcAmount = Number(
        formatEther(usdgAmounts.reduce((a, b) => a.add(b), BigNumber.from(0)))
      );

      let glpPrice = 0;
      try {
        const aum = Number(
          formatUnits(
            await glpManager.getAum(false, { blockTag: blockNumber }),
            30
          )
        );
        const glp_totalSupply = Number(
          formatEther(
            await glp.totalSupply({
              blockTag: blockNumber,
            })
          )
        );
        glpPrice = glp_totalSupply > 0 ? aum / glp_totalSupply : 0;
      } catch {}
      // const glpPrice = Number(
      //   formatEther(
      //     await dnGmxJuniorVault.getPrice(false, {
      //       blockTag: blockNumber,
      //     })
      //   )
      // );

      const wethPrice = await price(weth.address, blockNumber, networkName);
      const wbtcPrice = await price(wbtc.address, blockNumber, networkName);

      return {
        blockNumber,
        timestamp: block.timestamp,
        totalUsdcAmount,
        wethUsdgAmount,
        wbtcUsdgAmount,
        glpPrice,
        wethPrice,
        wbtcPrice,
      };
    }
  );

  return data;
}
