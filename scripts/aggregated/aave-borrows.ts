import type { NetworkName } from '@ragetrade/sdk'
import { aave, deltaNeutralGmxVaults, tokens } from '@ragetrade/sdk'
import { fetchJson, formatUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { days, timestampRoundDown } from '../../utils'
import { intersection } from './util/combine'
import { gmxVault, juniorVault } from './util/events'
import { price } from './util/helpers'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type GlobalAaveBorrowsEntry = Entry<{
  timestamp: number
  vdWbtcInterest: number
  vdWbtcInterestDollars: number
  vdWethInterest: number
  vdWethInterestDollars: number
}>

export interface GlobalAaveBorrowsDailyEntry {
  startTimestamp: number
  endTimestamp: number
  vdWbtcInterestNet: number
  vdWbtcInterestDollarsNet: number
  vdWethInterestNet: number
  vdWethInterestDollarsNet: number
}

export interface GlobalAaveBorrowsResult {
  data: GlobalAaveBorrowsEntry[]
  dailyData: GlobalAaveBorrowsDailyEntry[]
  dataLength: number
  totalVdWbtcInterest: number
  totalVdWbtcInterestDollars: number
  totalVdWethInterest: number
  totalVdWethInterestDollars: number
}

export async function getAaveBorrows(
  networkName: NetworkName,
  excludeRawData: boolean
): Promise<GlobalAaveBorrowsResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-aave-borrows?networkName=${networkName}`,
      timeout: 1_000_000_000 // huge number
    })
    delete resp.result.data
    return resp.result
  }

  const provider = getProviderAggregate(networkName)

  const { weth, wbtc } = tokens.getContractsSync(networkName, provider)
  const { aUsdc } = aave.getContractsSync(networkName, provider)
  const { dnGmxJuniorVault, dnGmxSeniorVault } = deltaNeutralGmxVaults.getContractsSync(
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
      const _btcAmountBefore = await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber - 1
      })
      const btcAmountBefore = Number(formatUnits(_btcAmountBefore, 8))

      const _btcAmountAfter = await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber
      })
      const btcAmountAfter = Number(formatUnits(_btcAmountAfter, 8))

      const _ethAmountBefore = await vdWeth.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber - 1
      })
      const ethAmountBefore = Number(formatUnits(_ethAmountBefore, 18))

      const _ethAmountAfter = await vdWeth.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber
      })
      const ethAmountAfter = Number(formatUnits(_ethAmountAfter, 18))

      const btcPrice = await price(wbtc.address, blockNumber, networkName)
      const ethPrice = await price(weth.address, blockNumber, networkName)

      return {
        blockNumber,
        timestamp: block.timestamp,
        eventName: event.event ?? 'unknown',
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

  const extraData: Entry<{
    vdWbtcInterest: number
    vdWbtcInterestDollars: number
    vdWethInterest: number
    vdWethInterestDollars: number
  }>[] = []

  let last
  for (const current of data) {
    if (last) {
      const vdWbtcInterest = current.btcAmountBefore - last.btcAmountAfter
      const vdWbtcInterestDollars = vdWbtcInterest * last.btcPrice

      const vdWethInterest = current.ethAmountBefore - last.ethAmountAfter
      const vdWethInterestDollars = vdWethInterest * last.ethPrice

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        vdWbtcInterest,
        vdWbtcInterestDollars,
        vdWethInterest,
        vdWethInterestDollars
      })
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        vdWbtcInterest: 0,
        vdWbtcInterestDollars: 0,
        vdWethInterest: 0,
        vdWethInterestDollars: 0
      })
    }
    last = current
  }

  const combinedData = intersection(data, extraData, (a, b) => ({
    ...a,
    ...b
  }))
  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalAaveBorrowsDailyEntry[], cur: GlobalAaveBorrowsEntry) => {
        let lastEntry = acc[acc.length - 1]
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.vdWbtcInterestNet += cur.vdWbtcInterest
          lastEntry.vdWbtcInterestDollarsNet += cur.vdWbtcInterestDollars
          lastEntry.vdWethInterestNet += cur.vdWethInterest
          lastEntry.vdWethInterestDollarsNet += cur.vdWethInterestDollars
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days < timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              vdWbtcInterestNet: 0,
              vdWbtcInterestDollarsNet: 0,
              vdWethInterestNet: 0,
              vdWethInterestDollarsNet: 0
            })
            lastEntry = acc[acc.length - 1]
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            vdWbtcInterestNet: cur.vdWbtcInterest,
            vdWbtcInterestDollarsNet: cur.vdWbtcInterestDollars,
            vdWethInterestNet: cur.vdWethInterest,
            vdWethInterestDollarsNet: cur.vdWethInterestDollars
          })
        }
        return acc
      },
      []
    ),
    dataLength: data.length,
    totalVdWbtcInterest: combinedData.reduce((acc, cur) => acc + cur.vdWbtcInterest, 0),
    totalVdWbtcInterestDollars: combinedData.reduce(
      (acc, cur) => acc + cur.vdWbtcInterestDollars,
      0
    ),
    totalVdWethInterest: combinedData.reduce((acc, cur) => acc + cur.vdWethInterest, 0),
    totalVdWethInterestDollars: combinedData.reduce(
      (acc, cur) => acc + cur.vdWethInterestDollars,
      0
    )
  }
}
