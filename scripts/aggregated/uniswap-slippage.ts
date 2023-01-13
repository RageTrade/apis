import { fetchJson, formatUnits } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { days, timestampRoundDown } from "../../utils";
import { GlobalTotalSharesResult } from "./total-shares";
import { combine } from "./util/combine";
import { decimals, name, price } from "./util/helpers";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";

import type { TokenSwappedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager";
import { juniorVault } from "./util/events";
export type GlobalUniswapSlippageEntry = Entry<{
  timestamp: number;

  uniswapVolume: number;
  uniswapSlippage: number;

  btcBought: number;
  ethBought: number;
  btcSold: number;
  ethSold: number;
  btcBoughtSlippage: number;
  ethBoughtSlippage: number;
  btcSoldSlippage: number;
  ethSoldSlippage: number;
}>;

export interface GlobalUniswapSlippageDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  uniswapSlippageNet: number;
  uniswapVolumeNet: number;
}

export interface GlobalUniswapSlippageResult {
  data: GlobalUniswapSlippageEntry[];
  dailyData: GlobalUniswapSlippageDailyEntry[];

  totalUniswapVolume: number;
  totalUniswapSlippage: number;

  totalBtcBought: number;
  totalEthBought: number;
  totalBtcSold: number;
  totalEthSold: number;
  totalBtcBoughtSlippage: number;
  totalEthBoughtSlippage: number;
  totalBtcSoldSlippage: number;
  totalEthSoldSlippage: number;
}

export async function getUniswapSlippage(
  networkName: NetworkName
): Promise<GlobalUniswapSlippageResult> {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [juniorVault.rebalanced],
    },
    async (_i, blockNumber, event) => {
      const rc = await provider.getTransactionReceipt(event.transactionHash);
      const filter = dnGmxJuniorVault.filters.TokenSwapped();
      const parsed = rc.logs
        .filter((log) => log.topics[0] === filter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as TokenSwappedEvent[];

      let uniswapVolume = 0;
      let uniswapSlippage = 0;

      let btcBought = 0;
      let ethBought = 0;
      let btcSold = 0;
      let ethSold = 0;
      let btcBoughtSlippage = 0;
      let ethBoughtSlippage = 0;
      let btcSoldSlippage = 0;
      let ethSoldSlippage = 0;

      for (const event of parsed) {
        const fromPrice = await price(
          event.args.fromToken,
          blockNumber,
          networkName
        );
        const toPrice = await price(
          event.args.toToken,
          blockNumber,
          networkName
        );

        const fromQuantity = Number(
          formatUnits(
            event.args.fromQuantity,
            decimals(event.args.fromToken, networkName)
          )
        );
        const toQuantity = Number(
          formatUnits(
            event.args.toQuantity,
            decimals(event.args.toToken, networkName)
          )
        );

        const fromDollar = fromPrice * fromQuantity;
        const toDollar = toPrice * toQuantity;
        const slippageDollar = toDollar - fromDollar;
        //   vaultSumSlippageDollar += slippageDollar;

        if (name(event.args.fromToken, networkName) === "wbtc") {
          btcSold += fromDollar;
          btcSoldSlippage += slippageDollar;
        }
        if (name(event.args.fromToken, networkName) === "weth") {
          ethSold += fromDollar;
          ethSoldSlippage += slippageDollar;
        }
        if (name(event.args.toToken, networkName) === "wbtc") {
          btcBought += toDollar;
          btcBoughtSlippage += slippageDollar;
        }
        if (name(event.args.toToken, networkName) === "weth") {
          ethBought += toDollar;
          ethBoughtSlippage += slippageDollar;
        }
        uniswapVolume += fromDollar;
        uniswapSlippage += slippageDollar;
      }

      return {
        blockNumber,
        transactionHash: event.transactionHash,
        uniswapVolume,
        uniswapSlippage,
        btcBought,
        ethBought,
        btcSold,
        ethSold,
        btcBoughtSlippage,
        ethBoughtSlippage,
        btcSoldSlippage,
        ethSoldSlippage,
      };
    }
  );

  const combinedData = combine(data, totalSharesData.result.data, (a, b) => ({
    ...a,
    timestamp: b.timestamp,
  }));

  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (
        acc: GlobalUniswapSlippageDailyEntry[],
        cur: GlobalUniswapSlippageEntry
      ) => {
        let lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.uniswapSlippageNet += cur.uniswapSlippage;
          lastEntry.uniswapVolumeNet += cur.uniswapVolume;
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days <
              timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              uniswapSlippageNet: 0,
              uniswapVolumeNet: 0,
            });
            lastEntry = acc[acc.length - 1];
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            uniswapSlippageNet: cur.uniswapSlippage,
            uniswapVolumeNet: cur.uniswapVolume,
          });
        }
        return acc;
      },
      []
    ),
    totalUniswapVolume: data.reduce((acc, cur) => acc + cur.uniswapVolume, 0),
    totalUniswapSlippage: data.reduce(
      (acc, cur) => acc + cur.uniswapSlippage,
      0
    ),
    totalBtcBought: data.reduce((acc, cur) => acc + cur.btcBought, 0),
    totalEthBought: data.reduce((acc, cur) => acc + cur.ethBought, 0),
    totalBtcSold: data.reduce((acc, cur) => acc + cur.btcSold, 0),
    totalEthSold: data.reduce((acc, cur) => acc + cur.ethSold, 0),
    totalBtcBoughtSlippage: data.reduce(
      (acc, cur) => acc + cur.btcBoughtSlippage,
      0
    ),
    totalEthBoughtSlippage: data.reduce(
      (acc, cur) => acc + cur.ethBoughtSlippage,
      0
    ),
    totalBtcSoldSlippage: data.reduce(
      (acc, cur) => acc + cur.btcSoldSlippage,
      0
    ),
    totalEthSoldSlippage: data.reduce(
      (acc, cur) => acc + cur.ethSoldSlippage,
      0
    ),
  };
}
