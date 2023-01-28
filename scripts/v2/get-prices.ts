import type { NetworkName } from '@ragetrade/sdk'
import { getPrices as getPricesSDK, stringifyBigNumber } from '@ragetrade/sdk'
import type { BigNumberish } from 'ethers'

import { getProvider } from '../../providers'

export async function getPrices(networkName: NetworkName, poolId: BigNumberish) {
  const provider = getProvider(networkName)
  const result = await getPricesSDK(provider, poolId)
  return stringifyBigNumber(result)
}
