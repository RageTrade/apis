import { fetchJson, formatEther, formatUnits } from "ethers/lib/utils";

import {
  gmxProtocol,
  NetworkName,
  ResultWithMetadata,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { glpRewards } from "./util/events/glp-rewards";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { GlobalTotalSharesResult } from "./total-shares";
import { combine } from "./util/combine";
import { timestampRoundDown, days } from "../../utils";

export type GlobalGlpRewardsEntry = Entry<{
  timestamp: number;
  glpRewards: number;
}>;

export interface GlobalGlpRewardsDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  glpRewardsNet: number;
}

export interface GlobalGlpRewardsResult {
  data: GlobalGlpRewardsEntry[];
  dailyData: GlobalGlpRewardsDailyEntry[];
}

export async function getGlpRewards(
  networkName: NetworkName
): Promise<GlobalGlpRewardsResult> {
  const provider = getProviderAggregate(networkName);

  const { glpManager } = gmxProtocol.getContractsSync(networkName, provider);
  const { fsGLP } = tokens.getContractsSync(networkName, provider);

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = await parallelize(
    networkName,
    provider,
    glpRewards,
    async (_i, blockNumber, eventName, transactionHash, logIndex, event) => {
      const { amount, glpStaked } = event.args;

      const [aumMax, _] = await glpManager.getAums({
        blockTag: event.blockNumber,
      });

      const glpTotalSuply = await fsGLP.totalSupply({
        blockTag: event.blockNumber,
      });

      const glpPrice = Number(formatUnits(aumMax.div(glpTotalSuply), 12));
      const glpRewards = Number(formatEther(glpStaked)) * glpPrice;
      const wethAmount = Number(formatEther(amount));

      return {
        blockNumber,
        eventName,
        transactionHash,
        logIndex,
        glpPrice,
        wethAmount,
        glpStaked,
        glpRewards,
      };
    }
  );

  const combinedData = combine(data, totalSharesData.result.data, (a, b) => ({
    ...a,
    timestamp: b.timestamp,
  }));

  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalGlpRewardsDailyEntry[], cur: GlobalGlpRewardsEntry) => {
        const lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.glpRewardsNet += cur.glpRewards;
        } else {
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            glpRewardsNet: cur.glpRewards,
          });
        }
        return acc;
      },
      []
    ),
  };
}
