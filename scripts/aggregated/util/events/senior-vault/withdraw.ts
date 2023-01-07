import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { WithdrawEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxSeniorVault";
import { ethers } from "ethers";

export async function withdraw(
  networkName: NetworkName,
  provider: ethers.providers.Provider
): Promise<WithdrawEvent[]> {
  const { dnGmxSeniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const events = await dnGmxSeniorVault.queryFilter(
    dnGmxSeniorVault.filters.Withdraw()
  );
  return events;
}
