import { ethers } from "ethers";

import { deltaNeutralGmxVaults, NetworkName, tokens } from "@ragetrade/sdk";
import { DepositTokenEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxBatchingManager";

import { SimpleEventCache } from "../../../../../indexer/simple-event-cache";

export async function depositToken(
  networkName: NetworkName,
  provider: ethers.providers.Provider
) {
  // if using a network that has indexer on for these logs, use the indexer
  // if (networkName === "arbmain") {
  //   return (await depositToken_cached(networkName)).sort(
  //     (a, b) => a.blockNumber - b.blockNumber
  //   );
  // }

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

async function depositToken_cached(networkName: NetworkName) {
  const { weth } = tokens.getContractsSync(networkName);
  const { dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName);
  const filter = dnGmxBatchingManager.filters.DepositToken(null, weth.address);

  // @ts-ignore
  const runningEvent = dnGmxBatchingManager._getRunningEvent(filter);
  const logs = await new SimpleEventCache(networkName, filter).getEvents();
  return logs.map((log) =>
    dnGmxBatchingManager._wrapEvent(runningEvent, log, null as any)
  ) as DepositTokenEvent[];
}
