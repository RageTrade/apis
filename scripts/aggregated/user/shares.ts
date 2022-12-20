import { fetchJson, formatEther } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  formatUsdc,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { EventFn, parallelize } from "../util/parallelize";
import { GlobalTotalSharesResult } from "../total-shares";
import { Entry } from "../util/types";
import { depositWithdrawRebalance } from "../util/events/deposit-withdraw-rebalance";
import { glpSwapped } from "../util/events/glp-swapped";
import { ethers } from "ethers";
import { glpRewards } from "../util/events/glp-rewards";

export type UserSharesEntry = Entry<{
  timestamp: number;
  userShares: number;
  totalShares: number;
}>;

export interface UserSharesResult {
  data: UserSharesEntry[];
}

export async function getUserShares(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserSharesResult>> {
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

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data1 = await parallelize(
    networkName,
    provider,
    [
      depositWithdrawRebalance,
      glpSwapped,
      glpRewards,
    ] as EventFn<ethers.Event>[],
    async (_i, blockNumber, eventName, transactionHash, logIndex) => {
      const userDeposits = await dnGmxBatchingManager.userDeposits(
        userAddress,
        { blockTag: blockNumber }
      );
      const userRound = userDeposits.round.toNumber();
      const userUnclaimedShares = Number(
        formatEther(
          await dnGmxBatchingManager.unclaimedShares(userAddress, {
            blockTag: blockNumber,
          })
        )
      );
      const userClaimedShares = Number(
        formatEther(
          await dnGmxJuniorVault.balanceOf(userAddress, {
            blockTag: blockNumber,
          })
        )
      );
      const userUsdc = Number(
        formatUsdc(
          await dnGmxBatchingManager.usdcBalance(userAddress, {
            blockTag: blockNumber,
          })
        )
      );

      return {
        blockNumber,
        eventName,
        transactionHash,
        logIndex,
        userRound,
        userUnclaimedShares,
        userClaimedShares,
        userUsdc,
      };
    }
  );

  const data: UserSharesEntry[] = combine(
    totalSharesData.result.data,
    data1,
    (global, user) => {
      return {
        ...global,
        ...user,
        userShares:
          user.userUnclaimedShares +
          user.userClaimedShares +
          (global.roundUsdcBalance > 0 && user.userRound === global.currentRound
            ? (user.userUsdc * global.roundSharesMinted) /
              global.roundUsdcBalance
            : 0),
      };
    }
  );

  return {
    cacheTimestamp: totalSharesData.cacheTimestamp,
    result: { data },
  };
}
