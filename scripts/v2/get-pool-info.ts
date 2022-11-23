import { BigNumber, BigNumberish } from "ethers";

import {
  getPoolInfo as getPoolInfoSDK,
  NetworkName,
  stringifyBigNumber,
  pools,
} from "@ragetrade/sdk";

import { getProvider } from "../../providers";
import { ErrorWithStatusCode } from "../../utils";

export async function getPoolInfo(
  networkName: NetworkName,
  poolId: BigNumberish
) {
  if (pools[networkName] === undefined) {
    throw new ErrorWithStatusCode(
      `NetworkName ${networkName} is not valid or does not contain pools in the sdk.`,
      400
    );
  }

  let poolFound = false;
  for (const pool of pools[networkName]) {
    if (BigNumber.from(pool.poolId).eq(poolId)) {
      poolFound = true;
      break;
    }
  }

  if (!poolFound) {
    throw new ErrorWithStatusCode(
      `PoolId ${poolId} is incorrect for this network or sdk is not updated with latest pool.`,
      400
    );
  }

  const provider = getProvider(networkName);
  const result = await getPoolInfoSDK(provider, poolId);
  return stringifyBigNumber(result);
}
