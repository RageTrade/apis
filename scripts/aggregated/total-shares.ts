import type { NetworkName, ResultWithMetadata } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, formatUsdc } from '@ragetrade/sdk'
import type { ethers } from 'ethers'
import { fetchJson, formatEther } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import type { GlobalTraderPnlResult } from './trader-pnl'
import { batchingManager, juniorVault, seniorVault } from './util/events'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type GlobalTotalSharesEntry = Entry<{
  timestamp: number
  totalJuniorVaultShares: number
  totalSeniorVaultShares: number
  currentRound: number
  roundSharesMinted: number
  roundUsdcBalance: number
}>

export interface GlobalTotalSharesResult {
  data: GlobalTotalSharesEntry[]
}

export async function getTotalShares(
  networkName: NetworkName,
  excludeRawData: boolean
): Promise<GlobalTotalSharesResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000 // huge number
    })
    delete resp.result.data
    return resp.result
  }

  const provider = getProviderAggregate(networkName)

  const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)

  // this api contains extra block numbers
  const traderPnlData: ResultWithMetadata<GlobalTraderPnlResult> = await fetchJson({
    url: `http://localhost:3000/data/aggregated/get-trader-pnl?networkName=${networkName}`,
    timeout: 1_000_000_000 // huge number
  })

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        juniorVault.glpSwapped,
        seniorVault.deposit,
        seniorVault.withdraw,
        batchingManager.depositToken,
        // additional block numbers from trader pnl
        () => {
          const uniqueBlockNumbers = Array.from(
            new Set(traderPnlData.result.data.map((entry) => entry.blockNumber))
          )
          return uniqueBlockNumbers.map(
            (blockNumber) =>
              ({
                blockNumber,
                event: 'unknown',
                transactionHash: 'unknown',
                logIndex: -1
              } as ethers.Event)
          )
        }
      ],
      ignoreMoreEventsInSameBlock: true, // to prevent reprocessing same data
      startBlockNumber: 45412307
    },
    async (_i, blockNumber, event) => {
      const { timestamp } = await provider.getBlock(blockNumber)

      const totalJuniorVaultShares = Number(
        formatEther(
          await dnGmxJuniorVault.totalSupply({
            blockTag: blockNumber
          })
        )
      )
      const totalSeniorVaultShares = Number(
        formatUsdc(
          await dnGmxSeniorVault.totalSupply({
            blockTag: blockNumber
          })
        )
      )

      // extra global data used to calculate user shares
      const currentRound = (
        await dnGmxBatchingManager.currentRound({
          blockTag: blockNumber
        })
      ).toNumber()
      const roundSharesMinted = Number(
        formatEther(
          await dnGmxBatchingManager.roundSharesMinted({
            blockTag: blockNumber
          })
        )
      )
      const roundUsdcBalance = Number(
        formatUsdc(
          await dnGmxBatchingManager.roundUsdcBalance({
            blockTag: blockNumber
          })
        )
      )

      return {
        blockNumber,
        transactionHash: event.transactionHash,
        timestamp,
        totalJuniorVaultShares,
        totalSeniorVaultShares,
        currentRound,
        roundSharesMinted,
        roundUsdcBalance
      }
    }
  )

  return { data }
}
