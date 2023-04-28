import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, tokens } from '@ragetrade/sdk'
import { formatEther } from 'ethers/lib/utils'

import { ENV } from '../../env'
import { getProviderAggregate } from '../../providers'
import { days, timestampRoundDown } from '../../utils'
import { intersection } from './util/combine'
import { gmxVault, juniorVault } from './util/events'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type GlobalGlpPnlEntry = Entry<{
  timestamp: number
  fsGlp_balanceOf_juniorVault: number
  // fsGlp_balanceOf_batchingManager: number
  glpPrice: number
  glpPnl: number
}>

export interface GlobalGlpPnlDailyEntry {
  startTimestamp: number
  endTimestamp: number
  glpPnlNet: number
}

export interface GlobalGlpPnlResult {
  data: GlobalGlpPnlEntry[]
  dailyData: GlobalGlpPnlDailyEntry[]
}

export async function getGlpPnl(networkName: NetworkName): Promise<GlobalGlpPnlResult> {
  const data = await Indexer(networkName)
}

function Indexer(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName)

  const { fsGLP } = tokens.getContractsSync(networkName, provider)

  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  )

  const startBlock = ENV.START_BLOCK_NUMBER

  return parallelize(
    {
      label: 'getGlpPnl',
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        gmxVault.increasePoolAmount,
        gmxVault.decreasePoolAmount,
        gmxVault.increaseReservedAmount,
        gmxVault.decreaseReservedAmount
      ],
      ignoreMoreEventsInSameBlock: true, // to prevent reprocessing same data
      startBlockNumber: startBlock
    },
    async (_i, blockNumber, event) => {
      const block = await provider.getBlock(blockNumber)
      if (!block) return null

      const fsGlp_balanceOf_juniorVault = Number(
        formatEther(
          await fsGLP.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber
          })
        )
      )

      const glpPrice = Number(
        formatEther(
          await dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber
          })
        )
      )

      return {
        blockNumber,
        eventName: event.event ?? 'unknown',
        timestamp: block.timestamp,
        transactionHash: event.transactionHash,
        fsGlp_balanceOf_juniorVault,
        glpPrice
      }
    }
  )
}

function Aggregator() {
  const extraData = []

  // from: last processed block
  // to: current block

  let last
  for (const current of data) {
    if (last) {
      const glpPnl = last.fsGlp_balanceOf_juniorVault * (current.glpPrice - last.glpPrice)

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        fsGlp_balanceOf_juniorVault: current.fsGlp_balanceOf_juniorVault,
        // fsGlp_balanceOf_batchingManager: current.fsGlp_balanceOf_batchingManager,
        glpPrice: current.glpPrice,
        glpPnl
      })
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        fsGlp_balanceOf_juniorVault: current.fsGlp_balanceOf_juniorVault,
        // fsGlp_balanceOf_batchingManager: current.fsGlp_balanceOf_batchingManager,
        glpPrice: current.glpPrice,
        glpPnl: 0
      })
    }
    last = current
  }

  // combines all information
  const combinedData = intersection(data, extraData, (a, b) => ({
    ...a,
    ...b
  }))
  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalGlpPnlDailyEntry[], cur: GlobalGlpPnlEntry) => {
        let lastEntry = acc[acc.length - 1]
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.glpPnlNet += cur.glpPnl
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days < timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              glpPnlNet: 0
            })
            lastEntry = acc[acc.length - 1]
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            glpPnlNet: cur.glpPnl
          })
        }
        return acc
      },
      []
    )
  }
}
