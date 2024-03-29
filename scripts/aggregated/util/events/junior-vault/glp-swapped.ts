import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults } from '@ragetrade/sdk'

import { ErrorWithStatusCode, getLogs } from '../../../../../utils'

import type { GlpSwappedEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxJuniorVault'
import type { ethers } from 'ethers'

export async function glpSwapped(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlock?: number
): Promise<GlpSwappedEvent[]> {
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
    dnGmxJuniorVault.filters.GlpSwapped(),
    startBlock,
    endBlock,
    dnGmxJuniorVault
  )

  return logs as GlpSwappedEvent[]
}
