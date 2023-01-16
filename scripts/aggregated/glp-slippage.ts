import { fetchJson, formatEther, formatUnits } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  formatUsdc,
  gmxProtocol,
  NetworkName,
  ResultWithMetadata,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { days, timestampRoundDown } from "../../utils";
import { GlobalTotalSharesResult } from "./total-shares";
import { intersection } from "./util/combine";
import { juniorVault } from "./util/events";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { GlpSwappedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager";

export type GlobalGlpSlippageEntry = Entry<{
  timestamp: number;
  glpAmt: number;
  usdcAmt: number;
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
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
      ],
    },
    async (_i, blockNumber, event) => {
      const rc = await provider.getTransactionReceipt(event.transactionHash);
      const filter = dnGmxJuniorVault.filters.GlpSwapped();
      const parsed = rc.logs
        .filter((log) => log.topics[0] === filter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as GlpSwappedEvent[];

      let glpAmt = 0;
      let usdcAmt = 0;

      let glpPriceMin = 0;
      let pnlMin = 0;

      for (const event of parsed) {
        const _scaling = 1;
        let _pnlMin = 0;

        const { glpQuantity, usdcQuantity, fromGlpToUsdc } = event.args;

        const _glpAmt = Number(formatEther(glpQuantity));
        const _usdcAmt = Number(formatUsdc(usdcQuantity));

        const [_, aumMin] = await glpManager.getAums({
          blockTag: blockNumber,
        });

        const totalSuply = await fsGLP.totalSupply({
          blockTag: blockNumber,
        });

        const _glpPriceMin = Number(formatUnits(aumMin.div(totalSuply), 12));

        if (fromGlpToUsdc) {
          _pnlMin = _scaling * (_usdcAmt - _glpAmt * _glpPriceMin);
        } else {
          _pnlMin = _scaling * (_glpAmt * _glpPriceMin - _usdcAmt);
        }

        glpAmt += _glpAmt;
        usdcAmt += _usdcAmt;
        glpPriceMin = glpPriceMin;
        pnlMin += _pnlMin;
      }

      return {
        blockNumber,
        transactionHash: event.transactionHash,
        logIndex: event.logIndex,
        glpAmt,
        usdcAmt,
        glpPriceMin,
        pnlMin,
        glpSlippage: pnlMin,
      };
    }
  );

  const combinedData = intersection(
    data,
    totalSharesData.result.data,
    (a, b) => ({
      ...a,
      timestamp: b.timestamp,
    })
  );

  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalGlpSlippageDailyEntry[], cur: GlobalGlpSlippageEntry) => {
        let lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.glpSlippageNet += cur.glpSlippage;
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days <
              timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              glpSlippageNet: 0,
            });
            lastEntry = acc[acc.length - 1];
          }
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
