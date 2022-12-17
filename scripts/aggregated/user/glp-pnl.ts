import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { GlobalGlpPnlEntry, GlobalGlpPnlResult } from "../glp-pnl";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";

export type UserGlpPnlEntry = Entry<{
  userGlpPnl: number;
}>;

export interface UserGlpRnlResult {
  data: UserGlpPnlEntry[];
  userTotalGlpPnl: number;
}

export async function getUserGlpPnl(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserGlpRnlResult>> {
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

  const glpPnlResponse: ResultWithMetadata<GlobalGlpPnlResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-glp-pnl?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = combine(
    glpPnlResponse.result.data,
    userSharesResponse.result.data,
    (glpPnlData, userSharesData) => ({
      ...glpPnlData,
      ...userSharesData,
      userGlpPnl:
        (glpPnlData.glpPnl * userSharesData.userShares) /
        userSharesData.totalShares,
    })
  );

  return {
    cacheTimestamp:
      glpPnlResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            glpPnlResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      userTotalGlpPnl: data.reduce((acc, cur) => acc + cur.userGlpPnl, 0),
      data,
    },
  };
}
