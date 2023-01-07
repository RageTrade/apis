import { fetchJson, formatEther, formatUnits } from "ethers/lib/utils";

import {
  aave,
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { combine } from "./util/combine";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { price } from "./util/helpers";
import { juniorVault } from "./util/events";
import { GlobalTotalSharesResult } from "./total-shares";
import { timestampRoundDown, days } from "../../utils";

export type GlobalAavePnlEntry = Entry<{
  timestamp: number;
  aavePnl: number;
}>;

export interface GlobalAavePnlDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  aavePnlNet: number;
}

export interface GlobalAavePnlResult {
  data: GlobalAavePnlEntry[];
  dailyData: GlobalAavePnlDailyEntry[];
  totalAavePnl: number;
}

export async function getAavePnl(
  networkName: NetworkName
): Promise<GlobalAavePnlResult> {
  const provider = getProviderAggregate(networkName);

  const { weth, wbtc } = tokens.getContractsSync(networkName, provider);
  const { aUsdc } = aave.getContractsSync(networkName, provider);
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

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
    {
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
      ],
      ignoreMoreEventsInSameBlock: true, // to prevent reprocessing same data
    },
    async (_i, blockNumber, event) => {
      const btcAmountBefore = Number(
        formatUnits(
          await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          }),
          8
        )
      );
      const btcAmountAfter = Number(
        formatUnits(
          await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          }),
          8
        )
      );
      const ethAmountBefore = Number(
        formatEther(
          await vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          })
        )
      );
      const ethAmountAfter = Number(
        formatEther(
          await vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          })
        )
      );
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

  const extraData: Entry<{ aavePnl: number }>[] = [];

  let last;
  for (const current of dataWithTimestamp) {
    if (last) {
      let aavePnl = 0;
      aavePnl -=
        current.btcAmountBefore * current.btcPrice -
        last.btcAmountAfter * last.btcPrice;
      aavePnl -=
        current.ethAmountBefore * current.ethPrice -
        last.ethAmountAfter * last.ethPrice;

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        aavePnl,
      });
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        aavePnl: 0,
      });
    }
    last = current;
  }

  // combines both information
  const combinedData = combine(dataWithTimestamp, extraData, (a, b) => ({
    ...a,
    ...b,
  }));
  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalAavePnlDailyEntry[], cur: GlobalAavePnlEntry) => {
        const lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.aavePnlNet += cur.aavePnl;
        } else {
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            aavePnlNet: cur.aavePnl,
          });
        }
        return acc;
      },
      []
    ),
    totalAavePnl: combinedData.reduce(
      (acc: number, cur: GlobalAavePnlEntry) => acc + cur.aavePnl,
      0
    ),
  };
}
