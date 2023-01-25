import { fetchJson, formatEther } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { intersection } from "./util/combine";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { gmxVault, juniorVault } from "./util/events";
import { GlobalTotalSharesResult } from "./total-shares";
import { timestampRoundDown, days } from "../../utils";

export type GlobalGlpPnlEntry = Entry<{
  timestamp: number;
  fsGlp_balanceOf_juniorVault: number;
  fsGlp_balanceOf_batchingManager: number;
  glpPrice: number;
  glpPnl: number;
}>;

export interface GlobalGlpPnlDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  glpPnlNet: number;
}

export interface GlobalGlpPnlResult {
  data: GlobalGlpPnlEntry[];
  dailyData: GlobalGlpPnlDailyEntry[];
  totalGlpPnl: number;
}

export async function getGlpPnl(
  networkName: NetworkName
): Promise<GlobalGlpPnlResult> {
  const provider = getProviderAggregate(networkName);

  const { fsGLP } = tokens.getContractsSync(networkName, provider);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        gmxVault.increaseUsdgAmount,
        gmxVault.decreaseUsdgAmount,
      ],
      ignoreMoreEventsInSameBlock: true, // to prevent reprocessing same data
      startBlockNumber: 45412307,
    },
    async (_i, blockNumber, event) => {
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

      const glpPrice = Number(
        formatEther(
          await dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber,
          })
        )
      );

      return {
        blockNumber,
        transactionHash: event.transactionHash,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
        glpPrice,
      };
    }
  );

  const data2 = intersection(data, totalSharesData.result.data, (a, b) => ({
    ...a,
    timestamp: b.timestamp,
  }));

  const extraData = [];

  let last;
  for (const current of data2) {
    if (last) {
      const glpPnl =
        (last.fsGlp_balanceOf_juniorVault +
          last.fsGlp_balanceOf_batchingManager) *
        (current.glpPrice - last.glpPrice);

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        fsGlp_balanceOf_juniorVault: current.fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager:
          current.fsGlp_balanceOf_batchingManager,
        glpPrice: current.glpPrice,
        glpPnl,
      });
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        fsGlp_balanceOf_juniorVault: current.fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager:
          current.fsGlp_balanceOf_batchingManager,
        glpPrice: current.glpPrice,
        glpPnl: 0,
      });
    }
    last = current;
  }

  // combines all information
  const combinedData = intersection(data2, extraData, (a, b) => ({
    ...a,
    ...b,
  }));
  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalGlpPnlDailyEntry[], cur: GlobalGlpPnlEntry) => {
        let lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.glpPnlNet += cur.glpPnl;
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days <
              timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              glpPnlNet: 0,
            });
            lastEntry = acc[acc.length - 1];
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            glpPnlNet: cur.glpPnl,
          });
        }
        return acc;
      },
      []
    ),
    totalGlpPnl: combinedData.reduce(
      (acc: number, cur: GlobalGlpPnlEntry) => acc + cur.glpPnl,
      0
    ),
  };
}
