import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { combine } from "../util/combine";
import { UserSharesResult } from "./shares";
import { GlobalTraderPnlResult } from "../trader-pnl";
import { Entry } from "../util/types";
import { timestampRoundDown, days, safeDivNumer } from "../../../utils";

export type UserTraderPnlEntry = Entry<{
  timestamp: number;
  userTraderPnl: number;
}>;

export interface UserTraderPnlDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userTraderPnlNet: number;
}

export interface UserTraderPnlResult {
  data: UserTraderPnlEntry[];
  dailyData: UserTraderPnlDailyEntry[];
  userTotalTraderPnlNet: number;
}

export async function getUserTraderPnl(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserTraderPnlResult>> {
  const globalTraderPnlResponse: ResultWithMetadata<GlobalTraderPnlResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-trader-pnl?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = combine(
    globalTraderPnlResponse.result.data,
    userSharesResponse.result.data,
    (globalTraderPnlEntry, userSharesEntry) => ({
      ...globalTraderPnlEntry,
      ...userSharesEntry,
      userTraderPnl: safeDivNumer(
        globalTraderPnlEntry.traderPnlVault *
          userSharesEntry.userJuniorVaultShares,
        userSharesEntry.totalJuniorVaultShares
      ),
    })
  );

  return {
    cacheTimestamp:
      globalTraderPnlResponse.cacheTimestamp &&
      userSharesResponse.cacheTimestamp
        ? Math.min(
            globalTraderPnlResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserTraderPnlDailyEntry[], cur: UserTraderPnlEntry) => {
          let lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userTraderPnlNet += cur.userTraderPnl;
          } else {
            while (
              lastEntry &&
              lastEntry.startTimestamp + 1 * days <
                timestampRoundDown(cur.timestamp)
            ) {
              acc.push({
                startTimestamp: lastEntry.startTimestamp + 1 * days,
                endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
                userTraderPnlNet: 0,
              });
              lastEntry = acc[acc.length - 1];
            }
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userTraderPnlNet: cur.userTraderPnl,
            });
          }
          return acc;
        },
        []
      ),
      userTotalTraderPnlNet: data.reduce(
        (acc: number, cur: UserTraderPnlEntry) => acc + cur.userTraderPnl,
        0
      ),
    },
  };
}
