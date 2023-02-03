import { fetchJson, formatEther, formatUnits } from "ethers/lib/utils";

import {
  formatUsdc,
  gmxProtocol,
  NetworkName,
  ResultWithMetadata,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { days, timestampRoundDown } from "../../utils";
import { GlobalTotalSharesResult } from "./total-shares";
import { intersection } from "./util/combine";
import { juniorVault } from "./util/events";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { price } from "./util/helpers";

export type GlobalGlpRewardsEntry = Entry<{
  timestamp: number;
  juniorVaultWethReward: number;
  seniorVaultWethReward: number;
}>;

export interface GlobalGlpRewardsDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  juniorVaultWethRewardNet: number;
  seniorVaultWethRewardNet: number;
}

export interface GlobalGlpRewardsResult {
  data: GlobalGlpRewardsEntry[];
  dailyData: GlobalGlpRewardsDailyEntry[];
  dataLength: number;
  totalJuniorVaultWethReward: number;
  totalSeniorVaultWethReward: number;
}

export async function getGlpRewards(
  networkName: NetworkName,
  excludeRawData: boolean
): Promise<GlobalGlpRewardsResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-glp-rewards?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });
    delete resp.result.data;
    return resp.result;
  }

  const provider = getProviderAggregate(networkName);

  const { glpManager } = gmxProtocol.getContractsSync(networkName, provider);
  const { fsGLP, weth } = tokens.getContractsSync(networkName, provider);

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [juniorVault.rewardsHarvested],
      startBlockNumber: 45412307,
    },
    async (_i, blockNumber, event) => {
      // const { juniorVaultGlp, seniorVaultAUsdc } = event.args;

      const [aumMax, _] = await glpManager.getAums({
        blockTag: blockNumber,
      });

      const glpTotalSuply = await fsGLP.totalSupply({
        blockTag: blockNumber,
      });

      const glpPrice = Number(formatUnits(aumMax.div(glpTotalSuply), 12));
      const juniorVaultWethReward =
        Number(formatEther(event.args.juniorVaultGlp)) * glpPrice;
      const seniorVaultWethReward = Number(
        formatUsdc(event.args.seniorVaultAUsdc)
      );

      const ethPrice = await price(weth.address, blockNumber, networkName);

      return {
        blockNumber,
        transactionHash: event.transactionHash,
        wethHarvested: Number(formatEther(event.args.wethHarvested)),
        juniorVaultWeth: Number(formatEther(event.args.juniorVaultWeth)),
        seniorVaultWeth: Number(formatEther(event.args.seniorVaultWeth)),
        esGmxStaked: Number(formatEther(event.args.esGmxStaked)),
        juniorVaultGlp: Number(formatEther(event.args.juniorVaultGlp)),
        seniorVaultAUsdc: Number(formatUsdc(event.args.seniorVaultAUsdc)),
        aumMax: Number(formatUnits(aumMax, 30)),
        glpTotalSuply: Number(formatEther(glpTotalSuply)),
        glpPrice,
        ethPrice,
        juniorVaultWethReward,
        seniorVaultWethReward,
      };
    }
  );

  const combinedData = intersection(
    data,
    totalSharesData.result.data,
    (a, b) => ({
      ...a,
      timestamp: b.timestamp,
    })
  );

  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalGlpRewardsDailyEntry[], cur: GlobalGlpRewardsEntry) => {
        let lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.juniorVaultWethRewardNet += cur.juniorVaultWethReward;
          lastEntry.seniorVaultWethRewardNet += cur.seniorVaultWethReward;
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days <
              timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              juniorVaultWethRewardNet: 0,
              seniorVaultWethRewardNet: 0,
            });
            lastEntry = acc[acc.length - 1];
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            juniorVaultWethRewardNet: cur.juniorVaultWethReward,
            seniorVaultWethRewardNet: cur.seniorVaultWethReward,
          });
        }
        return acc;
      },
      []
    ),
    dataLength: data.length,
    totalJuniorVaultWethReward: combinedData.reduce(
      (acc, cur) => acc + cur.juniorVaultWethReward,
      0
    ),
    totalSeniorVaultWethReward: combinedData.reduce(
      (acc, cur) => acc + cur.seniorVaultWethReward,
      0
    ),
  };
}
