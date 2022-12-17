import { formatEther } from "ethers/lib/utils";

import { deltaNeutralGmxVaults, formatUsdc, NetworkName } from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { depositWithdrawRebalance } from "./util/events/deposit-withdraw-rebalance";

export type GlobalTotalSharesEntry = Entry<{
  totalShares: number;
  currentRound: number;
  roundSharesMinted: number;
  roundUsdcBalance: number;
}>;

export interface GlobalTotalSharesResult {
  data: GlobalTotalSharesEntry[];
}

export async function getTotalShares(
  networkName: NetworkName
): Promise<GlobalTotalSharesResult> {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  const data = await parallelize(
    networkName,
    provider,
    depositWithdrawRebalance,
    async (_i, blockNumber, eventName, transactionHash, logIndex) => {
      const totalShares = Number(
        formatEther(
          await dnGmxJuniorVault.totalSupply({
            blockTag: blockNumber,
          })
        )
      );

      // extra global data used to calculate user shares
      const currentRound = (
        await dnGmxBatchingManager.currentRound({
          blockTag: blockNumber,
        })
      ).toNumber();
      const roundSharesMinted = Number(
        formatEther(
          await dnGmxBatchingManager.roundSharesMinted({
            blockTag: blockNumber,
          })
        )
      );
      const roundUsdcBalance = Number(
        formatUsdc(
          await dnGmxBatchingManager.roundUsdcBalance({
            blockTag: blockNumber,
          })
        )
      );

      return {
        blockNumber,
        eventName,
        transactionHash,
        logIndex,
        totalShares,
        currentRound,
        roundSharesMinted,
        roundUsdcBalance,
      };
    }
  );

  return { data };
}
