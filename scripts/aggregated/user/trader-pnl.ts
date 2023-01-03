import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { UserSharesResult } from "./shares";
import { GlobalTraderPnlResult } from "../trader-pnl";
import { Entry } from "../util/types";
import { timestampRoundDown, days } from "../../../utils";

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
      userTraderPnl:
        (globalTraderPnlEntry.traderPnl * userSharesEntry.userShares) /
        userSharesEntry.totalShares,
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
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userTraderPnlNet += cur.userTraderPnl;
          } else {
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
