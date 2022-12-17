import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { ethers } from "ethers";

export async function depositWithdrawRebalance(
  networkName: NetworkName,
  provider: ethers.providers.Provider
) {
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
