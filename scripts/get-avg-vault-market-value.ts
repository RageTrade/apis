import type { NetworkName } from '@ragetrade/sdk'
import { formatUsdc, tricryptoVault } from '@ragetrade/sdk'
import { BigNumber } from 'ethers'

import { getProvider } from '../providers'
import { getBlockByTimestamp } from './get-block-by-timestamp'

// TODO delete this
export async function getAvgVaultMarketValue(networkName: NetworkName) {
  const provider = getProvider(networkName)
  const { curveYieldStrategy } = await tricryptoVault.getContracts(provider)

  let timestamp = Math.floor(Date.now() / 1000)
  let vmvSum = BigNumber.from(0)

  const hourDelay = 2
  let i = 0
  for (; i < 24 / hourDelay; i++) {
    const blockNumber = await getBlockByTimestamp(networkName, timestamp)
    const vmv = await curveYieldStrategy.getVaultMarketValue({
      blockTag: blockNumber
    })
    vmvSum = vmvSum.add(vmv)
    timestamp -= 3600 * hourDelay
  }

  return {
    curveYieldStrategy: formatUsdc(vmvSum.div(i))
  }
}
