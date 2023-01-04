import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import {
  DepositEvent,
  WithdrawEvent,
  RebalancedEvent,
} from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/interfaces/IDnGmxJuniorVault";
import { ethers } from "ethers";
import { SimpleEventCache } from "../../../../indexer/simple-event-cache";
import { rebalanced_cached } from "./rebalanced";

export async function depositWithdrawRebalance(
  networkName: NetworkName,
  provider: ethers.providers.Provider
): Promise<(DepositEvent | WithdrawEvent | RebalancedEvent)[]> {
  // if using a network that has indexer on for these logs, use the indexer
  if (networkName === "arbmain") {
    return [
      ...(await deposit_cached(networkName)),
      ...(await withdraw_cached(networkName)),
      ...(await rebalanced_cached(networkName)),
    ].sort((a, b) => a.blockNumber - b.blockNumber);
  }

  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const allDepositEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Deposit()
  );
  const allWithdrawEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Withdraw()
  );
  const allRebalancedEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Rebalanced()
  );
  return [
    ...allDepositEvents,
    ...allWithdrawEvents,
    ...allRebalancedEvents,
  ].sort((a, b) => a.blockNumber - b.blockNumber);
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
