import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { intersection } from "../util/combine";
import { UserSharesResult } from "./shares";
import { GlobalUniswapSlippageResult } from "../uniswap-slippage";
import { Entry } from "../util/types";
import { timestampRoundDown, days, safeDivNumer } from "../../../utils";

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
  dataLength: number;
  userTotalUniswapSlippage: number;
  userTotalUniswapVolume: number;
}

export async function getUserUniswapSlippage(
  networkName: NetworkName,
  userAddress: string,
  excludeRawData: boolean
): Promise<ResultWithMetadata<UserUniswapSlippageResult>> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-uniswap-slippage?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });
    delete resp.result.data;
    return resp.result;
  }

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

  const data = intersection(
    globalUniswapSlippageResponse.result.data,
    userSharesResponse.result.data,
    (globalUniswapSlippageEntry, userSharesEntry) => ({
      ...globalUniswapSlippageEntry,
      ...userSharesEntry,
      userUniswapSlippage: safeDivNumer(
        globalUniswapSlippageEntry.uniswapSlippage *
          userSharesEntry.userJuniorVaultShares,
        userSharesEntry.totalJuniorVaultShares
      ),
      userUniswapVolume: safeDivNumer(
        globalUniswapSlippageEntry.uniswapVolume *
          userSharesEntry.userJuniorVaultShares,
        userSharesEntry.totalJuniorVaultShares
      ),
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
          let lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userUniswapSlippageNet += cur.userUniswapSlippage;
            lastEntry.userUniswapVolumeNet += cur.userUniswapVolume;
          } else {
            while (
              lastEntry &&
              lastEntry.startTimestamp + 1 * days <
                timestampRoundDown(cur.timestamp)
            ) {
              acc.push({
                startTimestamp: lastEntry.startTimestamp + 1 * days,
                endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
                userUniswapSlippageNet: 0,
                userUniswapVolumeNet: 0,
              });
              lastEntry = acc[acc.length - 1];
            }
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
      dataLength: data.length,
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
