import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { GlobalAaveLendsResult } from "../aave-lends";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { days, timestampRoundDown } from "../../../utils";

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

  const data = combine(
    aaveLendsResponse.result.data,
    userSharesResponse.result.data,
    (aaveLendsData, userSharesData) => ({
      ...aaveLendsData,
      ...userSharesData,
      userAUsdcInterestJunior:
        (aaveLendsData.aUsdcInterestJunior *
          userSharesData.userSeniorVaultShares) /
        userSharesData.totalSeniorVaultShares,
      userAUsdcInterestSenior:
        (aaveLendsData.aUsdcInterestSenior *
          userSharesData.userSeniorVaultShares) /
        userSharesData.totalSeniorVaultShares,
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
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userAUsdcInterestJuniorNet += cur.userAUsdcInterestJunior;
            lastEntry.userAUsdcInterestSeniorNet += cur.userAUsdcInterestSenior;
          } else {
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
