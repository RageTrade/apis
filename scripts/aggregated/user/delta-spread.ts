import { fetchJson } from "ethers/lib/utils";

import { NetworkName, ResultWithMetadata } from "@ragetrade/sdk";

import { intersection } from "../util/combine";
import { GlobalDeltaSpreadResult } from "../delta-spread";
import { Entry } from "../util/types";
import { UserSharesResult } from "./shares";
import { days, safeDivNumer, timestampRoundDown } from "../../../utils";

export type UserDeltaSpreadEntry = Entry<{
  timestamp: number;

  userUniswapVolume: number;
  userUniswapSlippage: number;
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

  userUniswapSlippageNet: number;
  userUniswapVolumeNet: number;
  userBtcHedgeDeltaPnlNet: number;
  userEthHedgeDeltaPnlNet: number;
}

export interface UserDeltaSpreadResult {
  data: UserDeltaSpreadEntry[];
  dailyData: UserDeltaSpreadDailyEntry[];

  dataLength: number;
  userTotalUniswapVolume: number;
  userTotalUniswapSlippage: number;
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
  userAddress: string,
  excludeRawData: boolean
): Promise<ResultWithMetadata<UserDeltaSpreadResult>> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-delta-spread?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });
    delete resp.result.data;
    return resp.result;
  }

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

  const data = intersection(
    deltaSpreadResponse.result.data,
    userSharesResponse.result.data,
    (deltaSpreadData, userSharesData) => ({
      ...deltaSpreadData,
      ...userSharesData,
      userUniswapVolume: safeDivNumer(
        deltaSpreadData.uniswapVolume * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userUniswapSlippage: safeDivNumer(
        deltaSpreadData.uniswapSlippage * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userBtcBought: safeDivNumer(
        deltaSpreadData.btcBought * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userEthBought: safeDivNumer(
        deltaSpreadData.ethBought * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userBtcSold: safeDivNumer(
        deltaSpreadData.btcSold * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userEthSold: safeDivNumer(
        deltaSpreadData.ethSold * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userBtcBoughtSlippage: safeDivNumer(
        deltaSpreadData.btcBoughtSlippage *
          userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userEthBoughtSlippage: safeDivNumer(
        deltaSpreadData.ethBoughtSlippage *
          userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userBtcSoldSlippage: safeDivNumer(
        deltaSpreadData.btcSoldSlippage * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userEthSoldSlippage: safeDivNumer(
        deltaSpreadData.ethSoldSlippage * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userBtcHedgeDeltaPnl: safeDivNumer(
        deltaSpreadData.btcHedgeDeltaPnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userEthHedgeDeltaPnl: safeDivNumer(
        deltaSpreadData.ethHedgeDeltaPnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
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
          let lastEntry = acc[acc.length - 1];
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userUniswapSlippageNet += cur.userUniswapSlippage;
            lastEntry.userUniswapVolumeNet += cur.userUniswapVolume;
            lastEntry.userBtcHedgeDeltaPnlNet += cur.userBtcHedgeDeltaPnl;
            lastEntry.userEthHedgeDeltaPnlNet += cur.userEthHedgeDeltaPnl;
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
                userBtcHedgeDeltaPnlNet: 0,
                userEthHedgeDeltaPnlNet: 0,
              });
              lastEntry = acc[acc.length - 1];
            }
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userUniswapSlippageNet: cur.userUniswapSlippage,
              userUniswapVolumeNet: cur.userUniswapVolume,
              userBtcHedgeDeltaPnlNet: cur.userBtcHedgeDeltaPnl,
              userEthHedgeDeltaPnlNet: cur.userEthHedgeDeltaPnl,
            });
          }
          return acc;
        },
        []
      ),
      dataLength: data.length,
      userTotalUniswapVolume: data.reduce(
        (acc, cur) => acc + cur.userUniswapVolume,
        0
      ),
      userTotalUniswapSlippage: data.reduce(
        (acc, cur) => acc + cur.userUniswapSlippage,
        0
      ),
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
