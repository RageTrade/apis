import { fetchJson } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { combine } from "../util/combine";
import { GlobalDeltaSpreadResult } from "../delta-spread";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { days, timestampRoundDown } from "../../../utils";

export type UserDeltaSpreadEntry = Entry<{
  timestamp: number;

  userVolume: number;
  userSlippage: number;
  userBtcBought: number;
  userEthBought: number;
  userBtcSold: number;
  userEthSold: number;
  userBtcBoughtSlippage: number;
  userEthBoughtSlippage: number;
  userBtcSoldSlippage: number;
  userEthSoldSlippage: number;
  userBtcHedgeDeltaPnl: number;
  userEthHedgeDeltaPnl: number;
}>;

export interface UserDeltaSpreadDailyEntry {
  startTimestamp: number;
  endTimestamp: number;

  userSlippageNet: number;
  userVolumeNet: number;
  userBtcHedgeDeltaPnlNet: number;
  userEthHedgeDeltaPnlNet: number;
}

export interface UserDeltaSpreadResult {
  data: UserDeltaSpreadEntry[];
  dailyData: UserDeltaSpreadDailyEntry[];

  userTotalVolume: number;
  userTotalSlippage: number;
  userTotalBtcBought: number;
  userTotalEthBought: number;
  userTotalBtcSold: number;
  userTotalEthSold: number;
  userTotalBtcBoughtSlippage: number;
  userTotalEthBoughtSlippage: number;
  userTotalBtcSoldSlippage: number;
  userTotalEthSoldSlippage: number;
  userTotalBtcHedgeDeltaPnl: number;
  userTotalEthHedgeDeltaPnl: number;
}

export async function getUserDeltaSpread(
  networkName: NetworkName,
  userAddress: string
): Promise<ResultWithMetadata<UserDeltaSpreadResult>> {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const currentShares = await dnGmxJuniorVault.balanceOf(userAddress);
  // TODO add this check
  //   if (currentShares.isZero()) {
  //     throw new ErrorWithStatusCode(
  //       "Junior vault shares for this address is zero, hence not allowed to perform aggregate query",
  //       400
  //     );
  //   }

  const deltaSpreadResponse: ResultWithMetadata<GlobalDeltaSpreadResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-delta-spread?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const userSharesResponse: ResultWithMetadata<UserSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = combine(
    deltaSpreadResponse.result.data,
    userSharesResponse.result.data,
    (deltaSpreadData, userSharesData) => ({
      ...deltaSpreadData,
      ...userSharesData,
      userVolume:
        (deltaSpreadData.volume * userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userSlippage:
        (deltaSpreadData.slippage * userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userBtcBought:
        (deltaSpreadData.btcBought * userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userEthBought:
        (deltaSpreadData.ethBought * userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userBtcSold:
        (deltaSpreadData.btcSold * userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userEthSold:
        (deltaSpreadData.ethSold * userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userBtcBoughtSlippage:
        (deltaSpreadData.btcBoughtSlippage *
          userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userEthBoughtSlippage:
        (deltaSpreadData.ethBoughtSlippage *
          userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userBtcSoldSlippage:
        (deltaSpreadData.btcSoldSlippage *
          userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userEthSoldSlippage:
        (deltaSpreadData.ethSoldSlippage *
          userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userBtcHedgeDeltaPnl:
        (deltaSpreadData.btcHedgeDeltaPnl *
          userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
      userEthHedgeDeltaPnl:
        (deltaSpreadData.ethHedgeDeltaPnl *
          userSharesData.userJuniorVaultShares) /
        userSharesData.totalJuniorVaultShares,
    })
  );

  return {
    cacheTimestamp:
      deltaSpreadResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            deltaSpreadResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserDeltaSpreadDailyEntry[], cur: UserDeltaSpreadEntry) => {
          const lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userSlippageNet += cur.userSlippage;
            lastEntry.userVolumeNet += cur.userVolume;
            lastEntry.userBtcHedgeDeltaPnlNet += cur.userBtcHedgeDeltaPnl;
            lastEntry.userEthHedgeDeltaPnlNet += cur.userEthHedgeDeltaPnl;
          } else {
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userSlippageNet: cur.userSlippage,
              userVolumeNet: cur.userVolume,
              userBtcHedgeDeltaPnlNet: cur.userBtcHedgeDeltaPnl,
              userEthHedgeDeltaPnlNet: cur.userEthHedgeDeltaPnl,
            });
          }
          return acc;
        },
        []
      ),
      userTotalVolume: data.reduce((acc, cur) => acc + cur.userVolume, 0),
      userTotalSlippage: data.reduce((acc, cur) => acc + cur.userSlippage, 0),
      userTotalBtcBought: data.reduce((acc, cur) => acc + cur.userBtcBought, 0),
      userTotalEthBought: data.reduce((acc, cur) => acc + cur.userEthBought, 0),
      userTotalBtcSold: data.reduce((acc, cur) => acc + cur.userBtcSold, 0),
      userTotalEthSold: data.reduce((acc, cur) => acc + cur.userEthSold, 0),
      userTotalBtcBoughtSlippage: data.reduce(
        (acc, cur) => acc + cur.userBtcBoughtSlippage,
        0
      ),
      userTotalEthBoughtSlippage: data.reduce(
        (acc, cur) => acc + cur.userEthBoughtSlippage,
        0
      ),
      userTotalBtcSoldSlippage: data.reduce(
        (acc, cur) => acc + cur.userBtcSoldSlippage,
        0
      ),
      userTotalEthSoldSlippage: data.reduce(
        (acc, cur) => acc + cur.userEthSoldSlippage,
        0
      ),
      userTotalBtcHedgeDeltaPnl: data.reduce(
        (acc, cur) => acc + cur.userBtcHedgeDeltaPnl,
        0
      ),
      userTotalEthHedgeDeltaPnl: data.reduce(
        (acc, cur) => acc + cur.userEthHedgeDeltaPnl,
        0
      ),
    },
  };
}
