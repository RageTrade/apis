import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { DepositEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxJuniorVault";
import { ethers } from "ethers";
import { SimpleEventCache } from "../../../../../indexer/simple-event-cache";

export async function deposit(
  networkName: NetworkName,
  provider: ethers.providers.Provider
): Promise<DepositEvent[]> {
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const events = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Deposit()
  );
  return events;
}

async function deposit_cached(networkName: NetworkName) {
  const { dnGmxJuniorVault } =
    deltaNeutralGmxVaults.getContractsSync(networkName);
  const filter = dnGmxJuniorVault.filters.Deposit();

  // @ts-ignore
  const runningEvent = dnGmxJuniorVault._getRunningEvent(filter);
  const logs = await new SimpleEventCache(networkName, filter).getEvents();
  return logs.map((log) =>
    dnGmxJuniorVault._wrapEvent(runningEvent, log, null as any)
  ) as DepositEvent[];
}
