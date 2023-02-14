import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults } from '@ragetrade/sdk'

import { ErrorWithStatusCode, getLogs } from '../../../../../utils'

import type { RebalancedEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/interfaces/IDnGmxJuniorVault'
import type { ethers } from 'ethers'

export async function rebalanced(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlock?: number
): Promise<RebalancedEvent[]> {
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  )

  const { DnGmxJuniorVaultDeployment } = deltaNeutralGmxVaults.getDeployments(networkName)

  if (!startBlock) startBlock = DnGmxJuniorVaultDeployment.receipt?.blockNumber
  const endBlock = await provider.getBlockNumber()

  if (!startBlock) {
    throw new ErrorWithStatusCode('Start block is not defined', 500)
  }

  const logs = await getLogs(
    dnGmxJuniorVault.filters.Rebalanced(),
    startBlock,
    endBlock,
    dnGmxJuniorVault
  )

  return logs as RebalancedEvent[]
}
