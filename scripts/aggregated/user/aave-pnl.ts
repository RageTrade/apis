import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { GlobalAavePnlResult } from "../aave-pnl";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { days, timestampRoundDown } from "../../../utils";

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
  userTotalAavePnl: number;
}

export async function getUserAavePnl(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserAavePnlResult>> {
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
    (aavePnlData, userSharesData) => ({
      ...aavePnlData,
      ...userSharesData,
      userAavePnl:
        (aavePnlData.aavePnl * userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
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
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userAavePnlNet += cur.userAavePnl;
          } else {
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
      userTotalAavePnl: data.reduce((acc, cur) => acc + cur.userAavePnl, 0),
    },
  };
}
