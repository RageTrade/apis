import { formatEther } from "ethers/lib/utils";

import { deltaNeutralGmxVaults, formatUsdc, NetworkName } from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { EventFn, parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { depositWithdrawRebalance } from "./util/events/deposit-withdraw-rebalance";
import { ethers } from "ethers";
import { glpRewards } from "./util/events/glp-rewards";
import { glpSwapped } from "./util/events/glp-swapped";

export type GlobalTotalSharesEntry = Entry<{
  timestamp: number;
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
    [
      depositWithdrawRebalance,
      glpSwapped,
      glpRewards,
    ] as EventFn<ethers.Event>[],
    async (_i, blockNumber, eventName, transactionHash, logIndex) => {
      const { timestamp } = await provider.getBlock(blockNumber);

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
        timestamp,
        totalShares,
        currentRound,
        roundSharesMinted,
        roundUsdcBalance,
      };
    }
  );

  return { data };
}
