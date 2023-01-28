import type { Amount, BigNumberStringified, NetworkName, VaultName } from '@ragetrade/sdk'
import {
  getVaultMarketValue as getVaultMarketValueSDK,
  stringifyBigNumber
} from '@ragetrade/sdk'

import { getProvider } from '../../providers'

export async function getVaultMarketValue(
  networkName: NetworkName,
  vaultName: VaultName
): Promise<{ vaultMarketValue: BigNumberStringified<Amount> }> {
  const provider = getProvider(networkName)
  const result = await getVaultMarketValueSDK(provider, vaultName)
  return stringifyBigNumber(result)
}
