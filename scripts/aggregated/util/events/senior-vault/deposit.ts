import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { DepositEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxSeniorVault";
import { ethers } from "ethers";

export async function deposit(
  networkName: NetworkName,
  provider: ethers.providers.Provider
): Promise<DepositEvent[]> {
  const { dnGmxSeniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const events = await dnGmxSeniorVault.queryFilter(
    dnGmxSeniorVault.filters.Deposit()
  );
  return events;
}
