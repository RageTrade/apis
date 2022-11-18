import { NetworkName, gmxProtocol, tokens } from "@ragetrade/sdk";
import { getProvider } from "../providers";
import { ErrorWithStatusCode } from "../utils";

export async function getGmxVaultInfoByTokenAddress(
  networkName: NetworkName,
  tokenAddress: string
) {
  const provider = getProvider(networkName);
  const { usdc, usdt, weth, wbtc } = await tokens.getContracts(provider);
  if (
    ![usdc, usdt, weth, wbtc]
      .map((c) => c.address.toLowerCase())
      .includes(tokenAddress.toLowerCase())
  ) {
    throw new ErrorWithStatusCode(
      `TokenAddress ${tokenAddress} is not allowed`,
      400
    );
  }

  const { gmxUnderlyingVault } = await gmxProtocol.getContracts(provider);

  const price = await gmxUnderlyingVault.getMinPrice(tokenAddress);
  return {
    underlyingVaultMinPrice: price.toString(),
  };
}
