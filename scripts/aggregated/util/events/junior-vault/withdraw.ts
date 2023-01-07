import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { WithdrawEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxJuniorVault";
import { ethers } from "ethers";
import { SimpleEventCache } from "../../../../../indexer/simple-event-cache";

export async function withdraw(
  networkName: NetworkName,
  provider: ethers.providers.Provider
): Promise<WithdrawEvent[]> {
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const events = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Withdraw()
  );
  return events;
}

async function withdraw_cached(networkName: NetworkName) {
  const { dnGmxJuniorVault } =
    deltaNeutralGmxVaults.getContractsSync(networkName);
  const filter = dnGmxJuniorVault.filters.Withdraw();

  // @ts-ignore
  const runningEvent = dnGmxJuniorVault._getRunningEvent(filter);
  const logs = await new SimpleEventCache(networkName, filter).getEvents();
  return logs.map((log) =>
    dnGmxJuniorVault._wrapEvent(runningEvent, log, null as any)
  ) as WithdrawEvent[];
}
