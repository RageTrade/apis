import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults } from '@ragetrade/sdk'
import type { WithdrawEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxSeniorVault'
import type { ethers } from 'ethers'

import { ErrorWithStatusCode } from '../../../../../utils'
import { getLogsInLoop } from '../../helpers'
import { GET_LOGS_BLOCK_INTERVAL } from '../common'

export async function withdraw(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlock?: number
): Promise<WithdrawEvent[]> {
  const { dnGmxSeniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  )

  const { DnGmxSeniorVaultDeployment } = deltaNeutralGmxVaults.getDeployments(networkName)

  if (!startBlock) startBlock = DnGmxSeniorVaultDeployment.receipt?.blockNumber
  const endBlock = await provider.getBlockNumber()

  if (!startBlock) {
    throw new ErrorWithStatusCode('Start block is not defined', 500)
  }

  const logs = await getLogsInLoop(
    dnGmxSeniorVault,
    dnGmxSeniorVault.filters.Withdraw(),
    startBlock,
    endBlock,
    GET_LOGS_BLOCK_INTERVAL
  )

  return logs as WithdrawEvent[]
}
