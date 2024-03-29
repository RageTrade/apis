import type { NetworkName } from '@ragetrade/sdk'
import { getPoolInfo as getPoolInfoSDK, pools, stringifyBigNumber } from '@ragetrade/sdk'
import type { BigNumberish } from 'ethers'
import { BigNumber } from 'ethers'

import { getProvider } from '../../providers'
import { ErrorWithStatusCode } from '../../utils'

export async function getPoolInfo(networkName: NetworkName, poolId: BigNumberish) {
  if (pools[networkName] === undefined) {
    throw new ErrorWithStatusCode(
      `NetworkName ${networkName} is not valid or does not contain pools in the sdk.`,
      400
    )
  }

  let poolFound = false
  for (const pool of pools[networkName]) {
    if (BigNumber.from(pool.poolId).eq(poolId)) {
      poolFound = true
      break
    }
  }

  if (!poolFound) {
    throw new ErrorWithStatusCode(
      `PoolId ${poolId} is invalid, valid pool ids for this network are ${pools[
        networkName
      ]
        .map((p) => Number(p.poolId))
        .join(', ')}`,
      400
    )
  }

  const provider = getProvider(networkName)
  const result = await getPoolInfoSDK(provider, poolId)
  return stringifyBigNumber(result)
}
