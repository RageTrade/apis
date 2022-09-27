import { BigNumberish } from "ethers";

import {
  getPrices as getPricesSDK,
  NetworkName,
  stringifyBigNumber,
} from "@ragetrade/sdk";

import { getProvider } from "../../providers";

export async function getPrices(
  networkName: NetworkName,
  poolId: BigNumberish
) {
  const provider = getProvider(networkName);
  const result = await getPricesSDK(provider, poolId);
  return stringifyBigNumber(result);
}
