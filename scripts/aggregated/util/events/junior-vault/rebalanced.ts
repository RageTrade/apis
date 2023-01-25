import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { RebalancedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/interfaces/IDnGmxJuniorVault";
import { ethers } from "ethers";
import { SimpleEventCache } from "../../../../../indexer/simple-event-cache";
import { ErrorWithStatusCode } from "../../../../../utils";
import { getLogsInLoop } from "../../helpers";
import { GET_LOGS_BLOCK_INTERVAL } from "../common";

export async function rebalanced(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlock?: number
): Promise<RebalancedEvent[]> {
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
    dnGmxJuniorVault.filters.Rebalanced(),
    startBlock,
    endBlock,
    GET_LOGS_BLOCK_INTERVAL
  );

  return logs as RebalancedEvent[];
}
