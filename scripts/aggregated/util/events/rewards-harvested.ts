import { deltaNeutralGmxVaults, NetworkName, tokens } from "@ragetrade/sdk";
import { ethers } from "ethers";

export async function rewardsHarvested(
  networkName: NetworkName,
  provider: ethers.providers.Provider
) {
  const { weth } = tokens.getContractsSync(networkName, provider);
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );
  const allEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.RewardsHarvested()
  );
  return allEvents;
}
