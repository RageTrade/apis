import { deltaNeutralGmxVaults, NetworkName, tokens } from "@ragetrade/sdk";
import { ethers } from "ethers";

export async function glpRewards(
  networkName: NetworkName,
  provider: ethers.providers.Provider
) {
  const { weth } = tokens.getContractsSync(networkName, provider);
  const { dnGmxBatchingManager } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );
  const allEvents = await dnGmxBatchingManager.queryFilter(
    dnGmxBatchingManager.filters.DepositToken(
      null,
      weth.address,
      null,
      null,
      null
    )
  );
  return allEvents;
}
