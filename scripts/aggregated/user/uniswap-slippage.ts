import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { UserSharesResult } from "./shares";
import { GlobalUniswapSlippageResult } from "../uniswap-slippage";
import { Entry } from "../util/types";
import { timestampRoundDown, days } from "../../../utils";

export type UserUniswapSlippageEntry = Entry<{
  timestamp: number;
  userUniswapSlippage: number;
  userUniswapVolume: number;
}>;

export interface UserUniswapSlippageDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userUniswapSlippageNet: number;
  userUniswapVolumeNet: number;
}

export interface UserUniswapSlippageResult {
  data: UserUniswapSlippageEntry[];
  dailyData: UserUniswapSlippageDailyEntry[];
  userTotalUniswapSlippage: number;
  userTotalUniswapVolume: number;
}

export async function getUserUniswapSlippage(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserUniswapSlippageResult>> {
  const globalUniswapSlippageResponse: ResultWithMetadata<GlobalUniswapSlippageResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-uniswap-slippage?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = combine(
    globalUniswapSlippageResponse.result.data,
    userSharesResponse.result.data,
    (globalUniswapSlippageEntry, userSharesEntry) => ({
      ...globalUniswapSlippageEntry,
      ...userSharesEntry,
      userUniswapSlippage:
        (globalUniswapSlippageEntry.uniswapSlippage *
          userSharesEntry.userJuniorVaultShares) /
        userSharesEntry.totalJuniorVaultShares,
      userUniswapVolume:
        (globalUniswapSlippageEntry.uniswapVolume *
          userSharesEntry.userJuniorVaultShares) /
        userSharesEntry.totalJuniorVaultShares,
    })
  );

  return {
    cacheTimestamp:
      globalUniswapSlippageResponse.cacheTimestamp &&
      userSharesResponse.cacheTimestamp
        ? Math.min(
            globalUniswapSlippageResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (
          acc: UserUniswapSlippageDailyEntry[],
          cur: UserUniswapSlippageEntry
        ) => {
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userUniswapSlippageNet += cur.userUniswapSlippage;
            lastEntry.userUniswapVolumeNet += cur.userUniswapVolume;
          } else {
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userUniswapSlippageNet: cur.userUniswapSlippage,
              userUniswapVolumeNet: cur.userUniswapVolume,
            });
          }
          return acc;
        },
        []
      ),
      userTotalUniswapSlippage: data.reduce(
        (acc, cur) => acc + cur.userUniswapSlippage,
        0
      ),
      userTotalUniswapVolume: data.reduce(
        (acc, cur) => acc + cur.userUniswapVolume,
        0
      ),
    },
  };
}
