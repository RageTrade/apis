import { formatEther, formatUnits } from "ethers/lib/utils";

import { gmxProtocol, NetworkName, tokens } from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { glpRewards } from "./util/events/glp-rewards";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";

export type GlobalGlpRewardsEntry = Entry<{
  glpRewards: number;
}>;

export interface GlobalGlpRewardsResult {
  data: GlobalGlpRewardsEntry[];
}

export async function getGlpRewards(
  networkName: NetworkName
): Promise<GlobalGlpRewardsResult> {
  const provider = getProviderAggregate(networkName);

  const { glpManager } = gmxProtocol.getContractsSync(networkName, provider);
  const { fsGLP } = tokens.getContractsSync(networkName, provider);

  const data = await parallelize(
    networkName,
    provider,
    glpRewards,
    async (_i, blockNumber, eventName, transactionHash, logIndex, event) => {
      const { amount, glpStaked } = event.args;

      const [aumMax, _] = await glpManager.getAums({
        blockTag: event.blockNumber,
      });

      const glpTotalSuply = await fsGLP.totalSupply({
        blockTag: event.blockNumber,
      });

      const glpPrice = Number(formatUnits(aumMax.div(glpTotalSuply), 12));
      const glpRewards = Number(formatEther(glpStaked)) * glpPrice;
      const wethAmount = Number(formatEther(amount));

      return {
        blockNumber,
        eventName,
        transactionHash,
        logIndex,
        glpPrice,
        wethAmount,
        glpStaked,
        glpRewards,
      };
    }
  );

  return { data };
}
