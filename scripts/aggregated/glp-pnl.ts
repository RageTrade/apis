import { formatEther } from "ethers/lib/utils";

import { deltaNeutralGmxVaults, NetworkName, tokens } from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { combine } from "./util/combine";
import { parallelizeOverEveryDWR } from "./util/template";
import { Entry } from "./util/types";

export type GlobalGlpPnlEntry = Entry<{
  fsGlp_balanceOf_juniorVault: number;
  fsGlp_balanceOf_batchingManager: number;
  glpPrice: number;
  glpPnl: number;
}>;

export interface GlobalGlpPnlResult {
  data: GlobalGlpPnlEntry[];
}

export async function getGlpPnl(
  networkName: NetworkName
): Promise<GlobalGlpPnlResult> {
  const provider = getProviderAggregate(networkName);

  const { fsGLP } = tokens.getContractsSync(networkName, provider);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  const data = await parallelizeOverEveryDWR(
    networkName,
    provider,
    async (_i, blockNumber, eventName, transactionHash, logIndex) => {
      const fsGlp_balanceOf_juniorVault = Number(
        formatEther(
          await fsGLP.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          })
        )
      );

      const fsGlp_balanceOf_batchingManager = Number(
        formatEther(
          await dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
            blockTag: blockNumber,
          })
        )
      );

      const glpPrice = Number(
        formatEther(
          await dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber,
          })
        )
      );

      return {
        blockNumber,
        eventName,
        transactionHash,
        logIndex,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
        glpPrice,
      };
    }
  );

  const extraData: GlobalGlpPnlEntry[] = [];

  let last;
  for (const current of data) {
    if (last) {
      const glpPnl =
        (last.fsGlp_balanceOf_juniorVault +
          last.fsGlp_balanceOf_batchingManager) *
        (current.glpPrice - last.glpPrice);

      extraData.push({
        blockNumber: current.blockNumber,
        eventName: current.eventName,
        transactionHash: current.transactionHash,
        logIndex: current.logIndex,
        fsGlp_balanceOf_juniorVault: current.fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager:
          current.fsGlp_balanceOf_batchingManager,
        glpPrice: current.glpPrice,
        glpPnl,
      });
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        eventName: current.eventName,
        transactionHash: current.transactionHash,
        logIndex: current.logIndex,
        fsGlp_balanceOf_juniorVault: current.fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager:
          current.fsGlp_balanceOf_batchingManager,
        glpPrice: current.glpPrice,
        glpPnl: 0,
      });
    }
    last = current;
  }

  // combines both information
  return { data: combine(data, extraData, (a, b) => ({ ...a, ...b })) };
}
