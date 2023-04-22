import type { NetworkName } from '@ragetrade/sdk'
import { gmxProtocol } from '@ragetrade/sdk'
import { ethers } from 'ethers'

import { getLogs } from '../../../../../utils'
import { getStartBlock, oneInTenBlocks } from './common'

export async function increasePoolAmount(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlockNumberOverride?: number,
  endBlockNumberOverride?: number
): Promise<ethers.Event[]> {
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)

  const _gmxUnderlyingVault = new ethers.Contract(
    gmxUnderlyingVault.address,
    ['event IncreasePoolAmount(address token, uint256 amount)'], // bcz not currently in interface in dn vault repo
    provider
  )

  const startBlock = getStartBlock(networkName)
  const endBlock = await provider.getBlockNumber()

  const logs = await getLogs(
    _gmxUnderlyingVault.filters.IncreasePoolAmount(),
    startBlockNumberOverride ?? startBlock,
    endBlockNumberOverride ?? endBlock,
    _gmxUnderlyingVault
  )

  return logs.filter(oneInTenBlocks)
}
