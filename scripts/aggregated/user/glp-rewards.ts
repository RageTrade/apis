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

export type UserGlpRewardsEntry = Entry<{
  userGlpRewards: number;
}>;

export interface UserGlpRewardsResult {
  data: UserGlpRewardsEntry[];
  userTotalGlpRewards: number;
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
      userGlpRewards:
        (glpRewardsData.glpRewards * userSharesData.userShares) /
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
      userTotalGlpRewards: data.reduce(
        (acc, cur) => acc + cur.userGlpRewards,
        0
      ),
      data,
    },
  };
}
