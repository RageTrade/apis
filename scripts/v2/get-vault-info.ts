import type { NetworkName, VaultName } from '@ragetrade/sdk'
import { getVaultInfo as getVaultInfoSDK, stringifyBigNumber } from '@ragetrade/sdk'

import { getProvider } from '../../providers'
import { getDataSourceByNetworkName } from './data-source'

export async function getVaultInfo(networkName: NetworkName, vaultName: VaultName) {
  const provider = getProvider(networkName)
  const ds = getDataSourceByNetworkName(networkName)
  const result = await getVaultInfoSDK(provider, vaultName, ds)
  return stringifyBigNumber(result)
}
