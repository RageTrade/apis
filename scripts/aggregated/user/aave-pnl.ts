import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { combineNonOverlappingEntries, addNullEntry } from "../util/combine";
import { GlobalAavePnlResult } from "../aave-pnl";
import { Entry } from "../util/types";
import { nullUserSharesEntry, UserSharesResult } from "./shares";
import { days, safeDivNumer, timestampRoundDown } from "../../../utils";

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

  console.log("aavePnlResponse", aavePnlResponse.result.data.length);
  console.log("userSharesResponse", userSharesResponse.result.data.length);

  const data = combineNonOverlappingEntries(
    aavePnlResponse.result.data,
    addNullEntry(userSharesResponse.result.data, nullUserSharesEntry),
    (aavePnlData, userSharesData) => ({
      ...userSharesData,
      ...aavePnlData,
      userAavePnl: safeDivNumer(
        aavePnlData.aavePnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
    })
  );

  console.log("data", data.length);

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
          if (cur.timestamp === 0) return acc;
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
