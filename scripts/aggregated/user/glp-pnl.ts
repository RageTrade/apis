import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { combine } from "../util/combine";
import { GlobalGlpPnlResult } from "../glp-pnl";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { timestampRoundDown, days, safeDivNumer } from "../../../utils";
import { matchWithNonOverlappingEntries } from "./common";

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
  userAddress: string,
  excludeRawData: boolean
): Promise<ResultWithMetadata<UserGlpPnlResult>> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-glp-pnl?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });
    delete resp.result.data;
    return resp.result;
  }

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
    matchWithNonOverlappingEntries.bind(null, userSharesResponse.result.data),
    (glpPnlData, userSharesData) => ({
      ...glpPnlData,
      ...userSharesData,
      userGlpPnl: safeDivNumer(
        glpPnlData.glpPnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
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
          let lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userGlpPnlNet += cur.userGlpPnl;
          } else {
            while (
              lastEntry &&
              lastEntry.startTimestamp + 1 * days <
                timestampRoundDown(cur.timestamp)
            ) {
              acc.push({
                startTimestamp: lastEntry.startTimestamp + 1 * days,
                endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
                userGlpPnlNet: 0,
              });
              lastEntry = acc[acc.length - 1];
            }
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
