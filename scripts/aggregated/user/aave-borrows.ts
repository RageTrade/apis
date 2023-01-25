import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { combine } from "../util/combine";
import { GlobalAaveBorrowsResult } from "../aave-borrows";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { days, safeDivNumer, timestampRoundDown } from "../../../utils";
import { matchWithNonOverlappingEntries } from "./common";

export type UserAaveBorrowsEntry = Entry<{
  timestamp: number;
  userVdWbtcInterest: number;
  userVdWbtcInterestDollars: number;
  userVdWethInterest: number;
  userVdWethInterestDollars: number;
}>;

export interface UserAaveBorrowsDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userVdWbtcInterestNet: number;
  userVdWbtcInterestDollarsNet: number;
  userVdWethInterestNet: number;
  userVdWethInterestDollarsNet: number;
}

export interface UserAaveBorrowsResult {
  data: UserAaveBorrowsEntry[];
  dailyData: UserAaveBorrowsDailyEntry[];
  userTotalVdWbtcInterest: number;
  userTotalVdWbtcInterestDollars: number;
  userTotalVdWethInterest: number;
  userTotalVdWethInterestDollars: number;
}

export async function getUserAaveBorrows(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserAaveBorrowsResult>> {
  const aaveBorrowsResponse: ResultWithMetadata<GlobalAaveBorrowsResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-aave-borrows?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = combine(
    aaveBorrowsResponse.result.data,
    userSharesResponse.result.data,
    matchWithNonOverlappingEntries.bind(null, userSharesResponse.result.data),
    (aaveBorrowsData, userSharesData) => ({
      ...aaveBorrowsData,
      ...userSharesData,
      userVdWbtcInterest: safeDivNumer(
        aaveBorrowsData.vdWbtcInterest * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userVdWbtcInterestDollars: safeDivNumer(
        aaveBorrowsData.vdWbtcInterestDollars *
          userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userVdWethInterest: safeDivNumer(
        aaveBorrowsData.vdWethInterest * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userVdWethInterestDollars: safeDivNumer(
        aaveBorrowsData.vdWethInterestDollars *
          userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
    })
  );

  return {
    cacheTimestamp:
      aaveBorrowsResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            aaveBorrowsResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserAaveBorrowsDailyEntry[], cur: UserAaveBorrowsEntry) => {
          let lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userVdWbtcInterestNet += cur.userVdWbtcInterest;
            lastEntry.userVdWbtcInterestDollarsNet +=
              cur.userVdWbtcInterestDollars;
            lastEntry.userVdWethInterestNet += cur.userVdWethInterest;
            lastEntry.userVdWethInterestDollarsNet +=
              cur.userVdWethInterestDollars;
          } else {
            while (
              lastEntry &&
              lastEntry.startTimestamp + 1 * days <
                timestampRoundDown(cur.timestamp)
            ) {
              acc.push({
                startTimestamp: lastEntry.startTimestamp + 1 * days,
                endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
                userVdWbtcInterestNet: 0,
                userVdWbtcInterestDollarsNet: 0,
                userVdWethInterestNet: 0,
                userVdWethInterestDollarsNet: 0,
              });
              lastEntry = acc[acc.length - 1];
            }
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userVdWbtcInterestNet: cur.userVdWbtcInterest,
              userVdWbtcInterestDollarsNet: cur.userVdWbtcInterestDollars,
              userVdWethInterestNet: cur.userVdWethInterest,
              userVdWethInterestDollarsNet: cur.userVdWethInterestDollars,
            });
          }
          return acc;
        },
        []
      ),
      userTotalVdWbtcInterest: data.reduce(
        (acc, cur) => acc + cur.userVdWbtcInterest,
        0
      ),
      userTotalVdWbtcInterestDollars: data.reduce(
        (acc, cur) => acc + cur.userVdWbtcInterestDollars,
        0
      ),
      userTotalVdWethInterest: data.reduce(
        (acc, cur) => acc + cur.userVdWethInterest,
        0
      ),
      userTotalVdWethInterestDollars: data.reduce(
        (acc, cur) => acc + cur.userVdWethInterestDollars,
        0
      ),
    },
  };
}
