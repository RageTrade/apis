import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { combine } from "../util/combine";
import { GlobalAavePnlResult } from "../aave-pnl";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { days, safeDivNumer, timestampRoundDown } from "../../../utils";
import { matchWithNonOverlappingEntries } from "./common";

export type UserAavePnlEntry = Entry<{
  timestamp: number;
  userAavePnl: number;
}>;

export interface UserAavePnlDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userAavePnlNet: number;
}

export interface UserAavePnlResult {
  data: UserAavePnlEntry[];
  dailyData: UserAavePnlDailyEntry[];
  dataLength: number;
  userTotalAavePnl: number;
}

export async function getUserAavePnl(
  networkName: NetworkName,
  userAddress: string,
  excludeRawData: boolean
): Promise<ResultWithMetadata<UserAavePnlResult>> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-aave-pnl?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });
    delete resp.result.data;
    return resp.result;
  }

  const aavePnlResponse: ResultWithMetadata<GlobalAavePnlResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-aave-pnl?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = combine(
    aavePnlResponse.result.data,
    userSharesResponse.result.data,
    matchWithNonOverlappingEntries.bind(null, userSharesResponse.result.data),
    (aavePnlData, userSharesData) => ({
      ...aavePnlData,
      ...userSharesData,
      userAavePnl: safeDivNumer(
        aavePnlData.aavePnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
    })
  );

  return {
    cacheTimestamp:
      aavePnlResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            aavePnlResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserAavePnlDailyEntry[], cur: UserAavePnlEntry) => {
          let lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userAavePnlNet += cur.userAavePnl;
          } else {
            while (
              lastEntry &&
              lastEntry.startTimestamp + 1 * days <
                timestampRoundDown(cur.timestamp)
            ) {
              acc.push({
                startTimestamp: lastEntry.startTimestamp + 1 * days,
                endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
                userAavePnlNet: 0,
              });
              lastEntry = acc[acc.length - 1];
            }
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userAavePnlNet: cur.userAavePnl,
            });
          }
          return acc;
        },
        []
      ),
      dataLength: data.length,
      userTotalAavePnl: data.reduce((acc, cur) => acc + cur.userAavePnl, 0),
    },
  };
}
