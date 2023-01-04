import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { GlpSwappedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxJuniorVault";
import { ethers } from "ethers";
import { SimpleEventCache } from "../../../../indexer/simple-event-cache";

export async function glpSwapped(
  networkName: NetworkName,
  provider: ethers.providers.Provider
) {
  // if using a network that has indexer on for these logs, use the indexer
  if (networkName === "arbmain") {
    return (await glpSwapped_cached(networkName)).sort(
      (a, b) => a.blockNumber - b.blockNumber
    );
  }

  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );
  const allEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.GlpSwapped()
  );
  return allEvents;
}

async function glpSwapped_cached(networkName: NetworkName) {
  const { dnGmxJuniorVault } =
    deltaNeutralGmxVaults.getContractsSync(networkName);
  const filter = dnGmxJuniorVault.filters.GlpSwapped();

  // @ts-ignore
  const runningEvent = dnGmxJuniorVault._getRunningEvent(filter);
  const logs = await new SimpleEventCache(networkName, filter).getEvents();
  return logs.map((log) =>
    dnGmxJuniorVault._wrapEvent(runningEvent, log, null as any)
  ) as GlpSwappedEvent[];
}
