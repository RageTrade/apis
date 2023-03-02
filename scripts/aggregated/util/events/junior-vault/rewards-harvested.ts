import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults } from '@ragetrade/sdk'
import type { RewardsHarvestedEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxJuniorVault'
import type { ethers } from 'ethers'

import { ErrorWithStatusCode, getLogs } from '../../../../../utils'

export async function rewardsHarvested(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlock?: number
): Promise<RewardsHarvestedEvent[]> {
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
    dnGmxJuniorVault.filters.RewardsHarvested(),
    startBlock,
    endBlock,
    dnGmxJuniorVault
  )

  return logs as RewardsHarvestedEvent[]
}
