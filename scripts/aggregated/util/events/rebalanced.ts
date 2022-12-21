import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { ethers } from "ethers";

export async function rebalanced(
  networkName: NetworkName,
  provider: ethers.providers.Provider
) {
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const allRebalancedEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Rebalanced()
  );
  return [...allRebalancedEvents].sort((a, b) => a.blockNumber - b.blockNumber);
}
