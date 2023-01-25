import { ethers } from "ethers";

import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { GlpSwappedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxJuniorVault";

import { ErrorWithStatusCode } from "../../../../../utils";
import { getLogsInLoop } from "../../helpers";
import { GET_LOGS_BLOCK_INTERVAL } from "../common";

export async function glpSwapped(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlock?: number
): Promise<GlpSwappedEvent[]> {
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const { DnGmxJuniorVaultDeployment } =
    deltaNeutralGmxVaults.getDeployments(networkName);

  if (!startBlock) startBlock = DnGmxJuniorVaultDeployment.receipt?.blockNumber;
  const endBlock = await provider.getBlockNumber();

  if (!startBlock) {
    throw new ErrorWithStatusCode("Start block is not defined", 500);
  }

  const logs = await getLogsInLoop(
    dnGmxJuniorVault,
    dnGmxJuniorVault.filters.GlpSwapped(),
    startBlock,
    endBlock,
    GET_LOGS_BLOCK_INTERVAL
  );

  return logs as GlpSwappedEvent[];
}
