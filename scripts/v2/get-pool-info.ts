import { BigNumberish } from "ethers";

import {
  getPoolInfo as getPoolInfoSDK,
  NetworkName,
  stringifyBigNumber,
} from "@ragetrade/sdk";

import { getProvider } from "../../providers";

export async function getPoolInfo(
  networkName: NetworkName,
  poolId: BigNumberish
) {
  const provider = getProvider(networkName);
  const result = await getPoolInfoSDK(provider, poolId);
  return stringifyBigNumber(result);
}
