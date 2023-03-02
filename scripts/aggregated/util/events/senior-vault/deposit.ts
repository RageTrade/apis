import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults } from '@ragetrade/sdk'
import type { DepositEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxSeniorVault'
import type { ethers } from 'ethers'

import { ErrorWithStatusCode, getLogs } from '../../../../../utils'

export async function deposit(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlock?: number
): Promise<DepositEvent[]> {
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

  const logs = await getLogs(
    dnGmxSeniorVault.filters.Deposit(),
    startBlock,
    endBlock,
    dnGmxSeniorVault
  )

  return logs as DepositEvent[]
}
