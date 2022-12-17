import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";

export async function getAavePnl(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<any>> {
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

  const aavePnlResponse: ResultWithMetadata<
    {
      blockNumber: number;
      eventName: string;
      transactionHash: string;
      logIndex: number;
      aavePnl: number;
    }[]
  > = await fetchJson({
    url: `http://localhost:3000/data/aggregated/get-aave-pnl?networkName=${networkName}`,
    timeout: 1_000_000_000, // huge number
  });

  const userSharesResponse: ResultWithMetadata<
    {
      blockNumber: number;
      eventName: string;
      transactionHash: string;
      logIndex: number;
      totalShares: number;
      userShares: number;
    }[]
  > = await fetchJson({
    url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
    timeout: 1_000_000_000, // huge number
  });

  const aggregateData = combine(
    aavePnlResponse.result,
    userSharesResponse.result,
    (aavePnlData, userSharesData) => ({
      ...aavePnlData,
      ...userSharesData,
      userAavePnl:
        (aavePnlData.aavePnl * userSharesData.userShares) /
        userSharesData.totalShares,
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
      userTotalAavePnl: aggregateData.reduce(
        (acc, cur) => acc + cur.userAavePnl,
        0
      ),
      aggregateData,
    },
  };
}
