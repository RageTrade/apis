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
  userSlippage: number;
  userVolume: number;
}>;

export interface UserUniswapSlippageDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  userSlippageNet: number;
  userVolumeNet: number;
}

export interface UserUniswapSlippageResult {
  userTotalSlippage: number;
  userTotalVolume: number;
  data: UserUniswapSlippageEntry[];
  dailyData: UserUniswapSlippageDailyEntry[];
}

export async function getUserUniswapSlippage(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserUniswapSlippageResult>> {
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
      userSlippage:
        (globalUniswapSlippageEntry.slippage * userSharesEntry.userShares) /
        userSharesEntry.totalShares,
      userVolume:
        (globalUniswapSlippageEntry.volume * userSharesEntry.userShares) /
        userSharesEntry.totalShares,
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
      userTotalSlippage: data.reduce((acc, cur) => acc + cur.userSlippage, 0),
      userTotalVolume: data.reduce((acc, cur) => acc + cur.userVolume, 0),
      data,
      dailyData: data.reduce(
        (
          acc: UserUniswapSlippageDailyEntry[],
          cur: UserUniswapSlippageEntry
        ) => {
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userSlippageNet += cur.userSlippage;
            lastEntry.userVolumeNet += cur.userVolume;
          } else {
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userSlippageNet: cur.userSlippage,
              userVolumeNet: cur.userVolume,
            });
          }
          return acc;
        },
        []
      ),
    },
  };
}
