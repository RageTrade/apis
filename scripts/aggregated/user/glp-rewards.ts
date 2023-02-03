import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { intersection } from "../util/combine";
import { GlobalGlpRewardsResult } from "../glp-rewards";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { timestampRoundDown, days, safeDivNumer } from "../../../utils";

export type UserGlpRewardsEntry = Entry<{
  timestamp: number;
  userJuniorVaultWethReward: number;
  userSeniorVaultWethReward: number;
}>;

export interface UserGlpRewardsDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userJuniorVaultWethRewardNet: number;
  userSeniorVaultWethRewardNet: number;
}

export interface UserGlpRewardsResult {
  data: UserGlpRewardsEntry[];
  dailyData: UserGlpRewardsDailyEntry[];
  dataLength: number;
  userTotalJuniorVaultWethReward: number;
  userTotalSeniorVaultWethReward: number;
}

export async function getUserGlpRewards(
  networkName: NetworkName,
  userAddress: string,
  excludeRawData: boolean
): Promise<ResultWithMetadata<UserGlpRewardsResult>> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-glp-rewards?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });
    delete resp.result.data;
    return resp.result;
  }

  const glpRewardsResponse: ResultWithMetadata<GlobalGlpRewardsResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-glp-rewards?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = intersection(
    glpRewardsResponse.result.data,
    userSharesResponse.result.data,
    (glpRewardsData, userSharesData) => ({
      ...glpRewardsData,
      ...userSharesData,
      userJuniorVaultWethReward: safeDivNumer(
        glpRewardsData.juniorVaultWethReward *
          userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userSeniorVaultWethReward: safeDivNumer(
        glpRewardsData.seniorVaultWethReward *
          userSharesData.userSeniorVaultShares,
        userSharesData.totalSeniorVaultShares
      ),
    })
  );

  return {
    cacheTimestamp:
      glpRewardsResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            glpRewardsResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserGlpRewardsDailyEntry[], cur: UserGlpRewardsEntry) => {
          let lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userJuniorVaultWethRewardNet +=
              cur.userJuniorVaultWethReward;
            lastEntry.userSeniorVaultWethRewardNet +=
              cur.userSeniorVaultWethReward;
          } else {
            while (
              lastEntry &&
              lastEntry.startTimestamp + 1 * days <
                timestampRoundDown(cur.timestamp)
            ) {
              acc.push({
                startTimestamp: lastEntry.startTimestamp + 1 * days,
                endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
                userJuniorVaultWethRewardNet: 0,
                userSeniorVaultWethRewardNet: 0,
              });
              lastEntry = acc[acc.length - 1];
            }
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userJuniorVaultWethRewardNet: cur.userJuniorVaultWethReward,
              userSeniorVaultWethRewardNet: cur.userSeniorVaultWethReward,
            });
          }
          return acc;
        },
        []
      ),
      dataLength: data.length,
      userTotalJuniorVaultWethReward: data.reduce(
        (acc, cur) => acc + cur.userJuniorVaultWethReward,
        0
      ),
      userTotalSeniorVaultWethReward: data.reduce(
        (acc, cur) => acc + cur.userSeniorVaultWethReward,
        0
      ),
    },
  };
}
