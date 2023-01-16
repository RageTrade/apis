import {
  aave,
  chainlink,
  deltaNeutralGmxVaults,
  formatUsdc,
  gmxProtocol,
  NetworkName,
  tokens,
} from "@ragetrade/sdk";
import { DnGmxJuniorVaultManager__factory } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults";
import { ethers } from "ethers";
import { formatEther, formatUnits } from "ethers/lib/utils";
import { getProviderAggregate } from "../../providers";
import { days, mins } from "../../utils";
import { juniorVault } from "../aggregated/util/events";
import { glpSwapped } from "../aggregated/util/events/junior-vault";
import { getLogsInLoop, price } from "../aggregated/util/helpers";
import { parallelize } from "../aggregated/util/parallelize";

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

  const startBlock = 44570369;
  const endBlock = await provider.getBlockNumber();

  // const startBlock = 52181070;
  // const endBlock = 52419731; // await provider.getBlockNumber();
  // const interval = 497; // Math.floor(((endBlock - startBlock) * 3 * mins) / days);

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [glpSwapped],
      ignoreMoreEventsInSameBlock: false,
    },
    async (_i, blockNumber, event) => {
      const glpPrice = Number(
        formatEther(
          await dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber,
          })
        )
      );
      return {
        blockNumber,
        contractAddress: event.address,
        glpQuantity: formatEther(event.args?.glpQuantity),
        usdcQuantity: formatUsdc(event.args?.usdcQuantity),
        fromGlpToUsdc: event.args.fromGlpToUsdc,
        glpPrice,
      };
    }
  );

  return data;
}
