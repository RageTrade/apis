import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk'
import type { ethers } from 'ethers'
import { BigNumber } from 'ethers'
import { formatEther, formatUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { days, timestampRoundDown } from '../../utils'
import { GlobalGlpPnlDailyEntry, GlobalGlpPnlEntry } from '../aggregated/glp-pnl'
import { intersection } from '../aggregated/util/combine'
import { price } from '../aggregated/util/helpers'
import { parallelize } from '../aggregated/util/parallelize'

export async function perInterval2(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName)

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)

  const { fsGLP } = tokens.getContractsSync(networkName, provider)

  const startBlock = 67434517
  const endBlock = 67739350
  const interval = 500

  const data = await parallelize(
    {
      label: 'per-interval-glp-pnl',
      networkName,
      provider,
      getEvents: () => {
        const events = []
        for (let i = startBlock; i <= endBlock; i += interval) {
          events.push({
            blockNumber: i
          })
        }
        return events as ethers.Event[]
      },
      ignoreMoreEventsInSameBlock: true
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
