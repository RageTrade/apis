import type { NetworkName } from '@ragetrade/sdk'
import { gmxProtocol } from '@ragetrade/sdk'
import { ethers } from 'ethers'

import { getLogs } from '../../../../../utils'
import { GET_LOGS_INTERVAL, getStartBlock, oneInFiftyBlocks } from './common'

export async function increasePoolAmount(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlockNumberOverride?: number
): Promise<ethers.Event[]> {
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)

  const _gmxUnderlyingVault = new ethers.Contract(
    gmxUnderlyingVault.address,
    ['event IncreasePoolAmount(address token, uint256 amount)'], // bcz not currently in interface in dn vault repo
    provider
  )

  let startBlock = getStartBlock(networkName)
  const endBlock = await provider.getBlockNumber()

  if (typeof startBlockNumberOverride === 'number') {
    // to make sure cache is hit for various startBlockNumberOverride
    startBlock +=
      GET_LOGS_INTERVAL *
      Math.floor((startBlockNumberOverride - startBlock) / GET_LOGS_INTERVAL)
  }

  const logs = await getLogs(
    _gmxUnderlyingVault.filters.IncreasePoolAmount(),
    startBlock,
    endBlock,
    _gmxUnderlyingVault
  )

  return logs.filter(oneInFiftyBlocks)
}
