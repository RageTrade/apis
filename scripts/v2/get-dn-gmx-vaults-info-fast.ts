import type { NetworkName } from '@ragetrade/sdk'
import {
  getDnGmxVaultsInfoFast as getDnGmxVaultsInfoFastSDK,
  stringifyBigNumber
} from '@ragetrade/sdk'

import { getProvider } from '../../providers'

export async function getDnGmxVaultsInfoFast(networkName: NetworkName) {
  const provider = getProvider(networkName)
  const result = await getDnGmxVaultsInfoFastSDK(provider)
  return stringifyBigNumber(result)
}
