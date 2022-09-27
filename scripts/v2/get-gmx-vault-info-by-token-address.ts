import {
  NetworkName,
  tokens,
  getGmxVaultInfoByTokenAddress as getGmxVaultInfoByTokenAddressSDK,
  stringifyBigNumber,
} from "@ragetrade/sdk";
import { getProvider } from "../../providers";
import { ErrorWithStatusCode } from "../../utils";

export async function getGmxVaultInfoByTokenAddress(
  networkName: NetworkName,
  tokenAddress: string
) {
  const provider = getProvider(networkName);
  const { usdc, usdt, weth, wbtc } = await tokens.getContracts(provider);
  if (![usdc, usdt, weth, wbtc].map((c) => c.address).includes(tokenAddress)) {
    throw new ErrorWithStatusCode(
      `TokenAddress ${tokenAddress} is not allowed`,
      400
    );
  }
  const result = await getGmxVaultInfoByTokenAddressSDK(provider, tokenAddress);
  return stringifyBigNumber(result);
}
