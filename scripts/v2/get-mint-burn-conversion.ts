import type { NetworkName } from '@ragetrade/sdk'
import {
  getGlpMintBurnConversionIntermediate as getGlpMintBurnConversionIntermediateSDK,
  stringifyBigNumber
} from '@ragetrade/sdk'

import { getProvider } from '../../providers'

export const getGlpMintBurnConversionIntermediate = async (networkName: NetworkName) => {
  const provider = getProvider(networkName)

  const result = await getGlpMintBurnConversionIntermediateSDK(provider, networkName)

  return stringifyBigNumber(result)
}
