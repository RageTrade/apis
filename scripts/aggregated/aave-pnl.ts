import type { NetworkName, ResultWithMetadata } from '@ragetrade/sdk'
import { aave, deltaNeutralGmxVaults, tokens } from '@ragetrade/sdk'
import { fetchJson, formatEther, formatUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { days, timestampRoundDown } from '../../utils'
import type { GlobalAaveBorrowsResult } from './aave-borrows'
import { intersection } from './util/combine'
import { gmxVault, juniorVault } from './util/events'
import { price } from './util/helpers'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type GlobalAavePnlEntry = Entry<{
  timestamp: number
  aavePnl: number
}>

export interface GlobalAavePnlDailyEntry {
  startTimestamp: number
  endTimestamp: number
  aavePnlNet: number
}

export interface GlobalAavePnlResult {
  data: GlobalAavePnlEntry[]
  dailyData: GlobalAavePnlDailyEntry[]
  dataLength: number
  totalAavePnl: number
}

export async function getAavePnl(
  networkName: NetworkName,
  excludeRawData: boolean
): Promise<GlobalAavePnlResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-aave-pnl?networkName=${networkName}`,
      timeout: 1_000_000_000 // huge number
    })
    delete resp.result.data
    return resp.result
  }

  const provider = getProviderAggregate(networkName)

  const { weth, wbtc } = tokens.getContractsSync(networkName, provider)
  const { aUsdc } = aave.getContractsSync(networkName, provider)
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  )

  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName)
  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress)
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress)

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
      const btcAmountBefore = Number(
        formatUnits(
          await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1
          }),
          8
        )
      )
      const btcAmountAfter = Number(
        formatUnits(
          await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber
          }),
          8
        )
      )
      const ethAmountBefore = Number(
        formatEther(
          await vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1
          })
        )
      )
      const ethAmountAfter = Number(
        formatEther(
          await vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber
          })
        )
      )
      const btcPrice = await price(wbtc.address, blockNumber, networkName)
      const ethPrice = await price(weth.address, blockNumber, networkName)

      return {
        blockNumber,
        eventName: event.event ?? 'unknown',
        timestamp: block.timestamp,
        transactionHash: event.transactionHash,
        btcAmountBefore,
        btcAmountAfter,
        ethAmountBefore,
        ethAmountAfter,
        btcPrice,
        ethPrice
      }
    }
  )

  const extraData: Entry<{ aavePnl: number }>[] = []

  let last
  for (const current of data) {
    if (last) {
      let aavePnl = 0
      aavePnl -=
        current.btcAmountBefore * current.btcPrice - last.btcAmountAfter * last.btcPrice
      aavePnl -=
        current.ethAmountBefore * current.ethPrice - last.ethAmountAfter * last.ethPrice

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        aavePnl
      })
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        aavePnl: 0
      })
    }
    last = current
  }

  // combines both information
  const combinedData1 = intersection(data, extraData, (a, b) => ({
    ...a,
    ...b
  }))

  const aaveBorrowsResponse: ResultWithMetadata<GlobalAaveBorrowsResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-aave-borrows?networkName=${networkName}`,
      timeout: 1_000_000_000 // huge number
    })
  const combinedData = intersection(
    combinedData1,
    aaveBorrowsResponse.result.data,
    (a, b) => ({
      ...a,
      ...b,
      aavePnl: a.aavePnl + b.vdWbtcInterestDollars + b.vdWethInterestDollars
    })
  )

  return {
    data: combinedData,
    dataLength: combinedData.length,
    dailyData: combinedData.reduce(
      (acc: GlobalAavePnlDailyEntry[], cur: GlobalAavePnlEntry) => {
        let lastEntry = acc[acc.length - 1]
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.aavePnlNet += cur.aavePnl
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days < timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              aavePnlNet: 0
            })
            lastEntry = acc[acc.length - 1]
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            aavePnlNet: cur.aavePnl
          })
        }
        return acc
      },
      []
    ),
    totalAavePnl: combinedData.reduce(
      (acc: number, cur: GlobalAavePnlEntry) => acc + cur.aavePnl,
      0
    )
  }
}
