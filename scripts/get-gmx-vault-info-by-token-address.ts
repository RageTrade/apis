import { NetworkName, getGmxVaultContracts } from "@ragetrade/sdk";
import { getProvider } from "../providers";

export async function getGmxVaultInfoByTokenAddress(
  networkName: NetworkName,
  tokenAddress: string
) {
  const provider = getProvider(networkName);
  const { gmxUnderlyingVault } = await getGmxVaultContracts(provider);

  const price = await gmxUnderlyingVault.getMinPrice(tokenAddress);
  return {
    underlyingVaultMinPrice: price.toString(),
  };
}
