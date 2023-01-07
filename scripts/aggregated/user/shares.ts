import { ethers } from "ethers";
import { fetchJson, formatEther, parseEther } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  formatUsdc,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { ErrorWithStatusCode } from "../../../utils";
import { GlobalTotalSharesResult } from "../total-shares";
import { combine } from "../util/combine";
import { parallelize } from "../util/parallelize";
import { Entry } from "../util/types";

import whitelist from "./whitelist";

export type UserSharesEntry = Entry<{
  timestamp: number;
  userJuniorVaultShares: number;
  userSeniorVaultShares: number;
  totalJuniorVaultShares: number;
  totalSeniorVaultShares: number;
}>;

export interface UserSharesResult {
  data: UserSharesEntry[];
}

export async function getUserShares(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserSharesResult>> {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  // for preventing abuse of user specific APIs
  // check if user is in whitelist
  if (
    !whitelist.map((a) => a.toLowerCase()).includes(userAddress.toLowerCase())
  ) {
    // otherwise, check if user has any shares in either vault
    const currentJuniorVaultShares = await dnGmxJuniorVault.balanceOf(
      userAddress
    );
    const currentSeniorVaultShares = await dnGmxJuniorVault.balanceOf(
      userAddress
    );
    if (
      currentJuniorVaultShares.lt(parseEther("100")) &&
      currentSeniorVaultShares.lt(parseEther("100"))
    ) {
      throw new ErrorWithStatusCode(
        `Balance of junior or senior vault shares found to be ${formatEther(
          currentJuniorVaultShares
        )} and ${formatEther(
          currentSeniorVaultShares
        )}, hence not allowed to perform user specific aggregate query for this address.`,
        400
      );
    }
  }

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data1 = await parallelize(
    networkName,
    provider,
    // use all events from total shares
    () =>
      totalSharesData.result.data.map(
        (entry) =>
          ({
            blockNumber: entry.blockNumber,
            transactionHash: entry.transactionHash,
            logIndex: entry.logIndex,
          } as ethers.Event)
      ),
    { uniqueBlocks: true },
    async (_i, blockNumber, event) => {
      const userSeniorVaultShares = Number(
        formatUsdc(
          await dnGmxSeniorVault.balanceOf(userAddress, {
            blockTag: blockNumber,
          })
        )
      );

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
        transactionHash: event.transactionHash,
        userSeniorVaultShares,
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
        userJuniorVaultShares:
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
