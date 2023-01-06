import { fetchJson, formatEther, formatUnits } from "ethers/lib/utils";

import {
  aave,
  deltaNeutralGmxVaults,
  formatUsdc,
  NetworkName,
  ResultWithMetadata,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { combine } from "./util/combine";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { price } from "./util/helpers";
import { depositWithdrawRebalance } from "./util/events/deposit-withdraw-rebalance";
import { GlobalTotalSharesResult } from "./total-shares";
import { timestampRoundDown, days } from "../../utils";

export type GlobalAaveBorrowsEntry = Entry<{
  timestamp: number;
  vdWbtcInterest: number;
  vdWbtcInterestDollars: number;
  vdWethInterest: number;
  vdWethInterestDollars: number;
}>;

export interface GlobalAaveBorrowsDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  vdWbtcInterestNet: number;
  vdWbtcInterestDollarsNet: number;
  vdWethInterestNet: number;
  vdWethInterestDollarsNet: number;
}

export interface GlobalAaveBorrowsResult {
  data: GlobalAaveBorrowsEntry[];
  dailyData: GlobalAaveBorrowsDailyEntry[];
  totalVdWbtcInterest: number;
  totalVdWbtcInterestDollars: number;
  totalVdWethInterest: number;
  totalVdWethInterestDollars: number;
}

export async function getAaveBorrows(
  networkName: NetworkName
): Promise<GlobalAaveBorrowsResult> {
  const provider = getProviderAggregate(networkName);

  const { weth, wbtc } = tokens.getContractsSync(networkName, provider);
  const { aUsdc } = aave.getContractsSync(networkName, provider);
  const { dnGmxJuniorVault, dnGmxSeniorVault } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName);
  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress);
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress);

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = await parallelize(
    networkName,
    provider,
    depositWithdrawRebalance,
    { uniqueBlocks: true },
    async (_i, blockNumber, event) => {
      const _btcAmountBefore = await vdWbtc.balanceOf(
        dnGmxJuniorVault.address,
        { blockTag: blockNumber - 1 }
      );
      const btcAmountBefore = Number(formatUnits(_btcAmountBefore, 8));

      const _btcAmountAfter = await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber,
      });
      const btcAmountAfter = Number(formatUnits(_btcAmountAfter, 8));

      const _ethAmountBefore = await vdWeth.balanceOf(
        dnGmxJuniorVault.address,
        { blockTag: blockNumber - 1 }
      );
      const ethAmountBefore = Number(formatUnits(_ethAmountBefore, 18));

      const _ethAmountAfter = await vdWeth.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber,
      });
      const ethAmountAfter = Number(formatUnits(_ethAmountAfter, 18));

      const btcPrice = await price(wbtc.address, blockNumber, networkName);
      const ethPrice = await price(weth.address, blockNumber, networkName);

      return {
        blockNumber,
        transactionHash: event.transactionHash,
        btcAmountBefore,
        btcAmountAfter,
        ethAmountBefore,
        ethAmountAfter,
        btcPrice,
        ethPrice,
      };
    }
  );

  const dataWithTimestamp = combine(
    data,
    totalSharesData.result.data,
    (a, b) => ({
      ...a,
      timestamp: b.timestamp,
    })
  );

  const extraData: Entry<{
    vdWbtcInterest: number;
    vdWbtcInterestDollars: number;
    vdWethInterest: number;
    vdWethInterestDollars: number;
  }>[] = [];

  let last;
  for (const current of dataWithTimestamp) {
    if (last) {
      const vdWbtcInterest = current.btcAmountBefore - last.btcAmountAfter;
      const vdWbtcInterestDollars = vdWbtcInterest * last.btcPrice;

      const vdWethInterest = current.ethAmountBefore - last.ethAmountAfter;
      const vdWethInterestDollars = vdWethInterest * last.ethPrice;

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        vdWbtcInterest,
        vdWbtcInterestDollars,
        vdWethInterest,
        vdWethInterestDollars,
      });
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        vdWbtcInterest: 0,
        vdWbtcInterestDollars: 0,
        vdWethInterest: 0,
        vdWethInterestDollars: 0,
      });
    }
    last = current;
  }

  const combinedData = combine(dataWithTimestamp, extraData, (a, b) => ({
    ...a,
    ...b,
  }));
  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalAaveBorrowsDailyEntry[], cur: GlobalAaveBorrowsEntry) => {
        const lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.vdWbtcInterestNet += cur.vdWbtcInterest;
          lastEntry.vdWbtcInterestDollarsNet += cur.vdWbtcInterestDollars;
          lastEntry.vdWethInterestNet += cur.vdWethInterest;
          lastEntry.vdWethInterestDollarsNet += cur.vdWethInterestDollars;
        } else {
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            vdWbtcInterestNet: cur.vdWbtcInterest,
            vdWbtcInterestDollarsNet: cur.vdWbtcInterestDollars,
            vdWethInterestNet: cur.vdWethInterest,
            vdWethInterestDollarsNet: cur.vdWethInterestDollars,
          });
        }
        return acc;
      },
      []
    ),
    totalVdWbtcInterest: combinedData.reduce(
      (acc, cur) => acc + cur.vdWbtcInterest,
      0
    ),
    totalVdWbtcInterestDollars: combinedData.reduce(
      (acc, cur) => acc + cur.vdWbtcInterestDollars,
      0
    ),
    totalVdWethInterest: combinedData.reduce(
      (acc, cur) => acc + cur.vdWethInterest,
      0
    ),
    totalVdWethInterestDollars: combinedData.reduce(
      (acc, cur) => acc + cur.vdWethInterestDollars,
      0
    ),
  };
}
