import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, tokens } from '@ragetrade/sdk'
import type { DepositTokenEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/vaults/DnGmxBatchingManager'
import type { ethers } from 'ethers'

import { ErrorWithStatusCode, getLogs } from '../../../../../utils'

export async function depositToken(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlock?: number
): Promise<DepositTokenEvent[]> {
  const { dnGmxBatchingManager } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  )
  const { weth } = tokens.getContractsSync(networkName, provider)
  const { DnGmxBatchingManagerDeployment } =
    deltaNeutralGmxVaults.getDeployments(networkName)

  if (!startBlock) startBlock = DnGmxBatchingManagerDeployment.receipt?.blockNumber
  const endBlock = await provider.getBlockNumber()

  if (!startBlock) {
    throw new ErrorWithStatusCode('Start block is not defined', 500)
  }

  const logs = await getLogs(
    dnGmxBatchingManager.filters.DepositToken(null, weth.address, null, null, null),
    startBlock,
    endBlock,
    dnGmxBatchingManager
  )

  return logs as DepositTokenEvent[]
}
