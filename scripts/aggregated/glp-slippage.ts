import { formatEther, formatUnits } from "ethers/lib/utils";

import {
  deltaNeutralGmxVaults,
  formatUsdc,
  gmxProtocol,
  NetworkName,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { combine } from "./util/combine";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import { depositWithdrawRebalance } from "./util/events/deposit-withdraw-rebalance";
import { glpSwapped } from "./util/events/glp-swapped";

export type GlobalGlpSlippageEntry = Entry<{
  glpAmt: number;
  usdcAmt: number;
  fromGlpToUsdc: boolean;
  glpPriceMin: number;
  pnlMin: number;
  glpSlippage: number;
}>;

export interface GlobalGlpSlippageResult {
  data: GlobalGlpSlippageEntry[];
}

export async function getGlpSlippage(
  networkName: NetworkName
): Promise<GlobalGlpSlippageResult> {
  const provider = getProviderAggregate(networkName);

  const { fsGLP } = tokens.getContractsSync(networkName, provider);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  const { glpManager } = gmxProtocol.getContractsSync(networkName, provider);

  const data = await parallelize(
    networkName,
    provider,
    glpSwapped,
    async (_i, blockNumber, eventName, transactionHash, logIndex, event) => {
      const scaling = 1;
      let pnlMin = 0;

      const { glpQuantity, usdcQuantity, fromGlpToUsdc } = event.args;

      const glpAmt = Number(formatEther(glpQuantity));
      const usdcAmt = Number(formatUsdc(usdcQuantity));

      const [_, aumMin] = await glpManager.getAums({
        blockTag: event.blockNumber,
      });

      const totalSuply = await fsGLP.totalSupply({
        blockTag: event.blockNumber,
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
        eventName,
        transactionHash,
        logIndex,
        glpAmt,
        usdcAmt,
        fromGlpToUsdc,
        glpPriceMin,
        pnlMin,
        glpSlippage: pnlMin,
      };
    }
  );

  return { data };
}
