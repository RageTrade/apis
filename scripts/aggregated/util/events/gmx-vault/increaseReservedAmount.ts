// event IncreaseReservedAmount(address token, uint256 amount);
// event DecreaseReservedAmount(address token, uint256 amount);

import type { NetworkName } from '@ragetrade/sdk'
import { gmxProtocol } from '@ragetrade/sdk'
import { ethers } from 'ethers'

import { getLogs } from '../../../../../utils'
import {
  GET_LOGS_INTERVAL,
  getStartBlock,
  oneInFiftyBlocks,
  oneInTenBlocks
} from './common'

export async function increaseReservedAmount(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlockNumberOverride?: number,
  endBlockNumberOverride?: number
): Promise<ethers.Event[]> {
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)

  const _gmxUnderlyingVault = new ethers.Contract(
    gmxUnderlyingVault.address,
    ['event IncreaseReservedAmount(address token, uint256 amount)'], // bcz not currently in interface in dn vault repo
    provider
  )

  let startBlock = getStartBlock(networkName)
  const endBlock = await provider.getBlockNumber()

  const logs = await getLogs(
    _gmxUnderlyingVault.filters.IncreaseReservedAmount(),
    startBlockNumberOverride ?? startBlock,
    endBlockNumberOverride ?? endBlock,
    _gmxUnderlyingVault
  )

  return logs //.filter(oneInTenBlocks)
}
