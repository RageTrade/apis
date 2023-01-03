import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { GlobalGlpPnlResult } from "../glp-pnl";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { timestampRoundDown, days } from "../../../utils";

export type UserGlpPnlEntry = Entry<{
  timestamp: number;
  userGlpPnl: number;
}>;

export interface UserGlpPnlDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userGlpPnlNet: number;
}

export interface UserGlpPnlResult {
  data: UserGlpPnlEntry[];
  dailyData: UserGlpPnlDailyEntry[];
  userTotalGlpPnl: number;
}

export async function getUserGlpPnl(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserGlpPnlResult>> {
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

  const glpPnlResponse: ResultWithMetadata<GlobalGlpPnlResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-glp-pnl?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = combine(
    glpPnlResponse.result.data,
    userSharesResponse.result.data,
    (glpPnlData, userSharesData) => ({
      ...glpPnlData,
      ...userSharesData,
      userGlpPnl:
        (glpPnlData.glpPnl * userSharesData.userShares) /
        userSharesData.totalShares,
    })
  );

  return {
    cacheTimestamp:
      glpPnlResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            glpPnlResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserGlpPnlDailyEntry[], cur: UserGlpPnlEntry) => {
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userGlpPnlNet += cur.userGlpPnl;
          } else {
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userGlpPnlNet: cur.userGlpPnl,
            });
          }
          return acc;
        },
        []
      ),
      userTotalGlpPnl: data.reduce((acc, cur) => acc + cur.userGlpPnl, 0),
    },
  };
}
