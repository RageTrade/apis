import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { ethers } from "ethers";

export async function glpSwapped(
  networkName: NetworkName,
  provider: ethers.providers.Provider
) {
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );
  const allEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.GlpSwapped()
  );
  return allEvents;
}
