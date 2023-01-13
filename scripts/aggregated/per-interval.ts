import {
  aave,
  chainlink,
  deltaNeutralGmxVaults,
  gmxProtocol,
  NetworkName,
  tokens,
} from "@ragetrade/sdk";
import { ethers } from "ethers";
import { formatEther, formatUnits } from "ethers/lib/utils";
import { getProviderAggregate } from "../../providers";
import { days, mins } from "../../utils";
import { juniorVault } from "./util/events";
import { getLogsInLoop, price } from "./util/helpers";
import { parallelize } from "./util/parallelize";

export async function perInterval(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(
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
  const { weth, wbtc, fsGLP } = tokens.getContractsSync(networkName, provider);

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

  const startBlock = 52181070;
  const endBlock = 52419731; // await provider.getBlockNumber();
  const interval = 497; // Math.floor(((endBlock - startBlock) * 3 * mins) / days);

  const _vault = new ethers.Contract(
    gmxUnderlyingVault.address,
    [
      "event IncreaseUsdgAmount(address token, uint256 amount)",
      "event DecreaseUsdgAmount(address token, uint256 amount)",
    ],
    provider
  );

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        () => {
          return getLogsInLoop(
            _vault,
            _vault.filters.IncreaseUsdgAmount(null, null),
            startBlock,
            endBlock,
            2000
          );
        },
        () => {
          return getLogsInLoop(
            _vault,
            _vault.filters.DecreaseUsdgAmount(null, null),
            startBlock,
            endBlock,
            2000
          );
        },
      ],
      //   () => {
      //     const events = [];
      //     for (let i = startBlock; i <= endBlock; i += interval) {
      //       events.push({
      //         blockNumber: i,
      //       });
      //     }
      //     return events as ethers.Event[];
      //   },
      ignoreMoreEventsInSameBlock: true,
    },
    async (_i, blockNumber) => {
      const usdgAmounts = await Promise.all(
        allWhitelistedTokens.map((token) =>
          gmxUnderlyingVault.usdgAmounts(token, { blockTag: blockNumber })
        )
      ); // 18 or 30
      const block = await provider.getBlock(blockNumber);
      const vdWbtc_balanceOf_dnGmxJuniorVault = await vdWbtc.balanceOf(
        dnGmxJuniorVault.address,
        { blockTag: blockNumber }
      );
      const vdWeth_balanceOf_dnGmxJuniorVault = await vdWeth.balanceOf(
        dnGmxJuniorVault.address,
        { blockTag: blockNumber }
      );

      const wethPrice = await price(weth.address, blockNumber, networkName);
      const wbtcPrice = await price(wbtc.address, blockNumber, networkName);
      const glpPrice = Number(
        formatEther(
          await dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber,
          })
        )
      );
      const linkPrice = Number(
        formatUnits(
          (
            await linkUsdAggregator.latestRoundData({
              blockTag: blockNumber,
            })
          ).answer,
          8
        )
      );
      const uniPrice = Number(
        formatUnits(
          (
            await uniUsdAggregator.latestRoundData({
              blockTag: blockNumber,
            })
          ).answer,
          8
        )
      );
      const fsGlp_balanceOf_juniorVault = Number(
        formatEther(
          await fsGLP.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          })
        )
      );
      const fsGlp_balanceOf_batchingManager = Number(
        formatEther(
          await dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
            blockTag: blockNumber,
          })
        )
      );
      const fsGlp_totalSuply = Number(
        formatEther(
          await fsGLP.totalSupply({
            blockTag: blockNumber,
          })
        )
      );

      // result
      const res: { [key: string]: string | number } = {
        blockNumber: blockNumber.toString(),
        timestamp: block.timestamp.toString(),
        vdWbtc_balanceOf_dnGmxJuniorVault: formatUnits(
          vdWbtc_balanceOf_dnGmxJuniorVault,
          8
        ),
        vdWeth_balanceOf_dnGmxJuniorVault: formatUnits(
          vdWeth_balanceOf_dnGmxJuniorVault,
          18
        ),
        wethPrice,
        wbtcPrice,
        glpPrice,
        linkPrice,
        uniPrice,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
        fsGlp_totalSuply,
      };

      for (let i = 0; i < allWhitelistedTokens.length; i++) {
        res[allWhitelistedTokens[i]] = formatUnits(usdgAmounts[i], 18);
      }

      return res;
    }
  );

  return data;
}
