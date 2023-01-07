import { fetchJson, formatEther, formatUnits } from "ethers/lib/utils";

import {
  formatUsdc,
  gmxProtocol,
  NetworkName,
  ResultWithMetadata,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { days, timestampRoundDown } from "../../utils";
import { GlobalTotalSharesResult } from "./total-shares";
import { combine } from "./util/combine";
import { juniorVault } from "./util/events";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";

export type GlobalGlpSlippageEntry = Entry<{
  timestamp: number;
  glpAmt: number;
  usdcAmt: number;
  fromGlpToUsdc: boolean;
  glpPriceMin: number;
  pnlMin: number;
  glpSlippage: number;
}>;

export interface GlobalGlpSlippageDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  glpSlippageNet: number;
}
export interface GlobalGlpSlippageResult {
  data: GlobalGlpSlippageEntry[];
  dailyData: GlobalGlpSlippageDailyEntry[];
  totalGlpSlippage: number;
}

export async function getGlpSlippage(
  networkName: NetworkName
): Promise<GlobalGlpSlippageResult> {
  const provider = getProviderAggregate(networkName);

  const { fsGLP } = tokens.getContractsSync(networkName, provider);

  const { glpManager } = gmxProtocol.getContractsSync(networkName, provider);

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [juniorVault.glpSwapped],
    },
    async (_i, blockNumber, event) => {
      const scaling = 1;
      let pnlMin = 0;

      const { glpQuantity, usdcQuantity, fromGlpToUsdc } = event.args;

      const glpAmt = Number(formatEther(glpQuantity));
      const usdcAmt = Number(formatUsdc(usdcQuantity));

      const [_, aumMin] = await glpManager.getAums({
        blockTag: blockNumber,
      });

      const totalSuply = await fsGLP.totalSupply({
        blockTag: blockNumber,
      });

      const glpPriceMin = Number(formatUnits(aumMin.div(totalSuply), 12));

      if (fromGlpToUsdc) {
        pnlMin = scaling * (usdcAmt - glpAmt * glpPriceMin);

        // cumilativePnlMin += scaling * (usdcAmt - glpAmt * glpPriceMin);

        // glpAccumulator += scaling * glpAmt;
        // usdcAccumulator += scaling * usdcAmt;
      } else {
        pnlMin = scaling * (glpAmt * glpPriceMin - usdcAmt);

        // cumilativePnlMin += scaling * (glpAmt * glpPriceMin - usdcAmt);

        // glpAccumulator -= scaling * glpAmt;
        // usdcAccumulator -= scaling * usdcAmt;
      }

      return {
        blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        glpAmt,
        usdcAmt,
        fromGlpToUsdc,
        glpPriceMin,
        pnlMin,
        glpSlippage: pnlMin,
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
      (acc: GlobalGlpSlippageDailyEntry[], cur: GlobalGlpSlippageEntry) => {
        const lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.glpSlippageNet += cur.glpSlippage;
        } else {
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            glpSlippageNet: cur.glpSlippage,
          });
        }
        return acc;
      },
      []
    ),
    totalGlpSlippage: combinedData.reduce(
      (acc, cur) => acc + cur.glpSlippage,
      0
    ),
  };
}
