import { fetchJson, formatEther } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  formatUsdc,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { EventFn, parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { depositWithdrawRebalance } from "./util/events/deposit-withdraw-rebalance";
import { ethers } from "ethers";
import { glpRewards } from "./util/events/glp-rewards";
import { glpSwapped } from "./util/events/glp-swapped";
import { GlobalTraderPnlResult } from "./trader-pnl";

export type GlobalTotalSharesEntry = Entry<{
  timestamp: number;
  totalJuniorVaultShares: number;
  totalSeniorVaultShares: number;
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

  const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  // this api contains extra block numbers
  const traderPnlData: ResultWithMetadata<GlobalTraderPnlResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-trader-pnl?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = await parallelize(
    networkName,
    provider,
    [
      depositWithdrawRebalance,
      glpSwapped,
      glpRewards,
      // additional block numbers from trader pnl
      () => {
        const uniqueBlockNumbers = Array.from(
          new Set(traderPnlData.result.data.map((entry) => entry.blockNumber))
        );
        return uniqueBlockNumbers.map(
          (blockNumber) =>
            ({
              blockNumber,
              event: "unknown",
              transactionHash: "unknown",
              logIndex: -1,
            } as ethers.Event)
        );
      },
    ] as EventFn<ethers.Event>[],
    { uniqueBlocks: true },
    async (_i, blockNumber, event) => {
      const { timestamp } = await provider.getBlock(blockNumber);

      const totalJuniorVaultShares = Number(
        formatEther(
          await dnGmxJuniorVault.totalSupply({
            blockTag: blockNumber,
          })
        )
      );
      const totalSeniorVaultShares = Number(
        formatEther(
          await dnGmxSeniorVault.totalSupply({
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
        transactionHash: event.transactionHash,
        timestamp,
        totalJuniorVaultShares,
        totalSeniorVaultShares,
        currentRound,
        roundSharesMinted,
        roundUsdcBalance,
      };
    }
  );

  return { data };
}
