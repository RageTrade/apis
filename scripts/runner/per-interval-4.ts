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
import { juniorVault } from "../aggregated/util/events";
import { getLogsInLoop, price } from "../aggregated/util/helpers";
import { parallelize } from "../aggregated/util/parallelize";

export async function perInterval2(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(
    networkName,
    provider
  );
  // const allWhitelistedTokensLength = (
  //   await gmxUnderlyingVault.allWhitelistedTokensLength()
  // ).toNumber();
  // const allWhitelistedTokens: string[] = [];
  // for (let i = 0; i < allWhitelistedTokensLength; i++) {
  //   allWhitelistedTokens.push(await gmxUnderlyingVault.allWhitelistedTokens(i));
  // }
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

  // const startBlock = 45682985; // Dec-13-2022 12:00:00 AM +UTC
  // const endBlock = 52689519; // 13 Jan
  // // const endBlock = 52419731; // await provider.getBlockNumber();
  // const interval = 3000; // 497; // Math.floor(((endBlock - startBlock) * 3 * mins) / days);

  // const startBlock = 50084140; // Oct 1
  // const endBlock = 53574140;

  const startBlock = 4221448; // Jan 1 2 AM UTC 2022
  const endBlock = 50083448;
  // const startBlock = 50084140;
  // const endBlock = 53574140;
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
      // const fsGlp_totalSuply = Number(
      //   formatEther(
      //     await fsGLP.totalSupply({
      //       blockTag: blockNumber,
      //     })
      //   )
      // );

      const wethGuaranteedUsd = Number(
        formatUnits(
          await gmxUnderlyingVault.guaranteedUsd(weth.address, {
            blockTag: blockNumber,
          }),
          30
        )
      );
      const wbtcGuaranteedUsd = Number(
        formatUnits(
          await gmxUnderlyingVault.guaranteedUsd(wbtc.address, {
            blockTag: blockNumber,
          }),
          30
        )
      );

      // result
      const res: { [key: string]: string | number } = {
        blockNumber: blockNumber.toString(),
        timestamp: block.timestamp,

        // fsGlp_totalSuply,
        wethGuaranteedUsd,
        wbtcGuaranteedUsd,
      };

      // for (let i = 0; i < allWhitelistedTokens.length; i++) {
      //   res[allWhitelistedTokens[i]] = formatUnits(usdgAmounts[i], 18);
      // }

      return res;
    }
  );

  return data;
}
