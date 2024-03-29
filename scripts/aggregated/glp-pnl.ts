import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, tokens } from '@ragetrade/sdk'
import { fetchJson, formatEther } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { days, timestampRoundDown } from '../../utils'
import { intersection } from './util/combine'
import { gmxVault, juniorVault } from './util/events'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type GlobalGlpPnlEntry = Entry<{
  timestamp: number
  fsGlp_balanceOf_juniorVault: number
  fsGlp_balanceOf_batchingManager: number
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
  dataLength: number
  totalGlpPnl: number
}

export async function getGlpPnl(
  networkName: NetworkName,
  excludeRawData: boolean
): Promise<GlobalGlpPnlResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-glp-pnl?networkName=${networkName}`,
      timeout: 1_000_000_000 // huge number
    })
    delete resp.result.data
    return resp.result
  }

  const provider = getProviderAggregate(networkName)

  const { fsGLP } = tokens.getContractsSync(networkName, provider)

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        gmxVault.increaseUsdgAmount,
        gmxVault.decreaseUsdgAmount
      ],
      ignoreMoreEventsInSameBlock: true, // to prevent reprocessing same data
      startBlockNumber: 45412307
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

      const fsGlp_balanceOf_batchingManager = Number(
        formatEther(
          await dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
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
        fsGlp_balanceOf_batchingManager,
        glpPrice
      }
    }
  )

  const extraData = []

  let last
  for (const current of data) {
    if (last) {
      const glpPnl =
        (last.fsGlp_balanceOf_juniorVault + last.fsGlp_balanceOf_batchingManager) *
        (current.glpPrice - last.glpPrice)

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        fsGlp_balanceOf_juniorVault: current.fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager: current.fsGlp_balanceOf_batchingManager,
        glpPrice: current.glpPrice,
        glpPnl
      })
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        fsGlp_balanceOf_juniorVault: current.fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager: current.fsGlp_balanceOf_batchingManager,
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
    ),
    dataLength: data.length,
    totalGlpPnl: combinedData.reduce(
      (acc: number, cur: GlobalGlpPnlEntry) => acc + cur.glpPnl,
      0
    )
  }
}
