import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { GlobalGlpSlippageResult } from "../glp-slippage";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { timestampRoundDown, days } from "../../../utils";

export type UserGlpSlippageEntry = Entry<{
  timestamp: number;
  userGlpSlippage: number;
}>;

export interface UserGlpSlippageDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userGlpSlippageNet: number;
}

export interface UserGlpSlippageResult {
  data: UserGlpSlippageEntry[];
  dailyData: UserGlpSlippageDailyEntry[];
  userTotalGlpSlippage: number;
}

export async function getUserGlpSlippage(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserGlpSlippageResult>> {
  const glpSlippageResponse: ResultWithMetadata<GlobalGlpSlippageResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-glp-slippage?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = combine(
    glpSlippageResponse.result.data,
    userSharesResponse.result.data,
    (glpSlippageData, userSharesData) => ({
      ...glpSlippageData,
      ...userSharesData,
      userGlpSlippage:
        (glpSlippageData.glpSlippage * userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
    })
  );

  return {
    cacheTimestamp:
      glpSlippageResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            glpSlippageResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserGlpSlippageDailyEntry[], cur: UserGlpSlippageEntry) => {
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userGlpSlippageNet += cur.userGlpSlippage;
          } else {
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userGlpSlippageNet: cur.userGlpSlippage,
            });
          }
          return acc;
        },
        []
      ),
      userTotalGlpSlippage: data.reduce(
        (acc, cur) => acc + cur.userGlpSlippage,
        0
      ),
    },
  };
}
