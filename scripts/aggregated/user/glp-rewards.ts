import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { GlobalGlpRewardsResult } from "../glp-rewards";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { timestampRoundDown, days } from "../../../utils";

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
  userTotalJuniorVaultWethReward: number;
  userTotalSeniorVaultWethReward: number;
}

export async function getUserGlpRewards(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserGlpRewardsResult>> {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  const currentShares = await dnGmxJuniorVault.balanceOf(userAddress);
  // TODO add this check
  //   if (currentShares.isZero()) {
  //     throw new ErrorWithStatusCode(
  //       "Junior vault shares for this address is zero, hence not allowed to perform aggregate query",
  //       400
  //     );
  //   }

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

  const data = combine(
    glpRewardsResponse.result.data,
    userSharesResponse.result.data,
    (glpRewardsData, userSharesData) => ({
      ...glpRewardsData,
      ...userSharesData,
      userJuniorVaultWethReward:
        (glpRewardsData.juniorVaultWethReward * userSharesData.userShares) /
        userSharesData.totalShares,
      userSeniorVaultWethReward:
        (glpRewardsData.seniorVaultWethReward * userSharesData.userShares) /
        userSharesData.totalShares,
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
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userJuniorVaultWethRewardNet +=
              cur.userJuniorVaultWethReward;
            lastEntry.userSeniorVaultWethRewardNet +=
              cur.userSeniorVaultWethReward;
          } else {
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
