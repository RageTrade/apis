import { formatEther } from "ethers/lib/utils";

import { deltaNeutralGmxVaults, formatUsdc, NetworkName } from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { parallelizeOverEveryDWR } from "./util/template";
import { Entry } from "./util/types";

export type GlobalTotalSharesEntry = Entry<{
  totalShares: number;
  currentRound: number;
  roundSharesMinted: number;
  roundUsdcBalance: number;
}>;

export interface GlobalTotalSharesResult {
  data: GlobalTotalSharesEntry[];
}

export async function getTotalShares(
  networkName: NetworkName
): Promise<GlobalTotalSharesResult> {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  const data = await parallelizeOverEveryDWR(
    networkName,
    provider,
    async (_i, blockNumber, eventName, transactionHash, logIndex) => {
      const totalShares = Number(
        formatEther(
          await dnGmxJuniorVault.totalSupply({
            blockTag: blockNumber,
          })
        )
      );

      // extra global data used to calculate user shares
      const currentRound = (
        await dnGmxBatchingManager.currentRound({
          blockTag: blockNumber,
        })
      ).toNumber();
      const roundSharesMinted = Number(
        formatEther(
          await dnGmxBatchingManager.roundSharesMinted({
            blockTag: blockNumber,
          })
        )
      );
      const roundUsdcBalance = Number(
        formatUsdc(
          await dnGmxBatchingManager.roundUsdcBalance({
            blockTag: blockNumber,
          })
        )
      );

      return {
        blockNumber,
        eventName,
        transactionHash,
        logIndex,
        totalShares,
        currentRound,
        roundSharesMinted,
        roundUsdcBalance,
      };
    }
  );

  return { data };
}
