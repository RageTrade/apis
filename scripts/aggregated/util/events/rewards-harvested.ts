import { deltaNeutralGmxVaults, NetworkName, tokens } from "@ragetrade/sdk";
import { RewardsHarvestedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxJuniorVault";
import { ethers } from "ethers";
import { SimpleEventCache } from "../../../../indexer/simple-event-cache";

export async function rewardsHarvested(
  networkName: NetworkName,
  provider: ethers.providers.Provider
) {
  // if using a network that has indexer on for these logs, use the indexer
  if (networkName === "arbmain") {
    return (await rewardsHarvested_cached(networkName)).sort(
      (a, b) => a.blockNumber - b.blockNumber
    );
  }

  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );
  const allEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.RewardsHarvested()
  );
  return allEvents;
}

export async function rewardsHarvested_cached(networkName: NetworkName) {
  const { dnGmxJuniorVault } =
    deltaNeutralGmxVaults.getContractsSync(networkName);
  const filter = dnGmxJuniorVault.filters.Rebalanced();

  // @ts-ignore
  const runningEvent = dnGmxJuniorVault._getRunningEvent(filter);
  const logs = await new SimpleEventCache(networkName, filter).getEvents();
  return logs.map((log) =>
    dnGmxJuniorVault._wrapEvent(runningEvent, log, null as any)
  ) as RewardsHarvestedEvent[];
}
