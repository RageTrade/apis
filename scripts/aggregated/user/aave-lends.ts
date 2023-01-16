import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { intersection } from "../util/combine";
import { GlobalAaveLendsResult } from "../aave-lends";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { days, safeDivNumer, timestampRoundDown } from "../../../utils";

export type UserAaveLendsEntry = Entry<{
  timestamp: number;
  userAUsdcInterestJunior: number;
  userAUsdcInterestSenior: number;
}>;

export interface UserAaveLendsDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userAUsdcInterestJuniorNet: number;
  userAUsdcInterestSeniorNet: number;
}

export interface UserAaveLendsResult {
  data: UserAaveLendsEntry[];
  dailyData: UserAaveLendsDailyEntry[];
  userTotalAUsdcInterestJunior: number;
  userTotalAUsdcInterestSenior: number;
}

export async function getUserAaveLends(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserAaveLendsResult>> {
  const aaveLendsResponse: ResultWithMetadata<GlobalAaveLendsResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-aave-lends?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = intersection(
    aaveLendsResponse.result.data,
    userSharesResponse.result.data,
    (aaveLendsData, userSharesData) => ({
      ...aaveLendsData,
      ...userSharesData,
      userAUsdcInterestJunior: safeDivNumer(
        aaveLendsData.aUsdcInterestJunior *
          userSharesData.userSeniorVaultShares,
        userSharesData.totalSeniorVaultShares
      ),
      userAUsdcInterestSenior: safeDivNumer(
        aaveLendsData.aUsdcInterestSenior *
          userSharesData.userSeniorVaultShares,
        userSharesData.totalSeniorVaultShares
      ),
    })
  );

  return {
    cacheTimestamp:
      aaveLendsResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            aaveLendsResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserAaveLendsDailyEntry[], cur: UserAaveLendsEntry) => {
          let lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userAUsdcInterestJuniorNet += cur.userAUsdcInterestJunior;
            lastEntry.userAUsdcInterestSeniorNet += cur.userAUsdcInterestSenior;
          } else {
            while (
              lastEntry &&
              lastEntry.startTimestamp + 1 * days <
                timestampRoundDown(cur.timestamp)
            ) {
              acc.push({
                startTimestamp: lastEntry.startTimestamp + 1 * days,
                endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
                userAUsdcInterestJuniorNet: 0,
                userAUsdcInterestSeniorNet: 0,
              });
              lastEntry = acc[acc.length - 1];
            }
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userAUsdcInterestJuniorNet: cur.userAUsdcInterestJunior,
              userAUsdcInterestSeniorNet: cur.userAUsdcInterestSenior,
            });
          }
          return acc;
        },
        []
      ),
      userTotalAUsdcInterestJunior: data.reduce(
        (acc, cur) => acc + cur.userAUsdcInterestJunior,
        0
      ),
      userTotalAUsdcInterestSenior: data.reduce(
        (acc, cur) => acc + cur.userAUsdcInterestSenior,
        0
      ),
    },
  };
}
