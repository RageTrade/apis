import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import {
  GlobalGlpSlippageEntry,
  GlobalGlpSlippageResult,
} from "../glp-slippage";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";

export type UserGlpSlippageEntry = Entry<{
  userGlpSlippage: number;
}>;

export interface UserGlpSlippageResult {
  data: UserGlpSlippageEntry[];
  userTotalGlpSlippage: number;
}

export async function getUserGlpSlippage(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserGlpSlippageResult>> {
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
        (glpSlippageData.glpSlippage * userSharesData.userShares) /
        userSharesData.totalShares,
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
      userTotalGlpSlippage: data.reduce(
        (acc, cur) => acc + cur.userGlpSlippage,
        0
      ),
      data,
    },
  };
}
