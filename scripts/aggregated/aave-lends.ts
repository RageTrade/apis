import type { NetworkName, ResultWithMetadata } from '@ragetrade/sdk'
import { aave, deltaNeutralGmxVaults, formatUsdc, tokens } from '@ragetrade/sdk'
import { ethers } from 'ethers'
import { fetchJson } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { days, timestampRoundDown } from '../../utils'
import type { GlobalTotalSharesResult } from './total-shares'
import { intersection } from './util/combine'
import { juniorVault, seniorVault } from './util/events'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type GlobalAaveLendsEntry = Entry<{
  timestamp: number
  aUsdcInterestJunior: number
  aUsdcInterestSenior: number
}>

export interface GlobalAaveLendsDailyEntry {
  startTimestamp: number
  endTimestamp: number
  aUsdcInterestJuniorNet: number
  aUsdcInterestSeniorNet: number
}

export interface GlobalAaveLendsResult {
  data: GlobalAaveLendsEntry[]
  dailyData: GlobalAaveLendsDailyEntry[]
  dataLength: number
  totalAUsdcInterestJunior: number
  totalAUsdcInterestSenior: number
}

export async function getAaveLends(
  networkName: NetworkName,
  excludeRawData: boolean
): Promise<GlobalAaveLendsResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-aave-lends?networkName=${networkName}`,
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

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> = await fetchJson({
    url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
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
        seniorVault.deposit,
        seniorVault.withdraw,
        () => [{ blockNumber: 68912424 } as ethers.Event] // include that one RebalanceProfit event
      ],
      ignoreMoreEventsInSameBlock: true, // to prevent reprocessing same data
      startBlockNumber: 45412307
    },
    async (_i, blockNumber, event) => {
      const aUsdcJuniorBefore = Number(
        formatUsdc(
          await aUsdc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1
          })
        )
      )
      const aUsdcJuniorAfter = Number(
        formatUsdc(
          await aUsdc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber
          })
        )
      )

      const aUsdcSeniorBefore = Number(
        formatUsdc(
          await aUsdc.balanceOf(dnGmxSeniorVault.address, {
            blockTag: blockNumber - 1
          })
        )
      )
      const aUsdcSeniorAfter = Number(
        formatUsdc(
          await aUsdc.balanceOf(dnGmxSeniorVault.address, {
            blockTag: blockNumber
          })
        )
      )

      return {
        blockNumber,
        eventName: event.event ?? 'unknown',
        transactionHash: event.transactionHash,
        aUsdcJuniorBefore,
        aUsdcJuniorAfter,
        aUsdcSeniorBefore,
        aUsdcSeniorAfter
      }
    }
  )

  const dataWithTimestamp = intersection(data, totalSharesData.result.data, (a, b) => ({
    ...a,
    timestamp: b.timestamp
  }))

  const extraData: Entry<{
    aUsdcInterestJunior: number
    aUsdcInterestSenior: number
  }>[] = []

  let last
  for (const current of dataWithTimestamp) {
    if (last) {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        aUsdcInterestJunior: current.aUsdcJuniorBefore - last.aUsdcJuniorAfter,
        aUsdcInterestSenior: current.aUsdcSeniorBefore - last.aUsdcSeniorAfter
      })
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        aUsdcInterestJunior: 0,
        aUsdcInterestSenior: 0
      })
    }
    last = current
  }

  const combinedData = intersection(dataWithTimestamp, extraData, (a, b) => ({
    ...a,
    ...b
  }))
  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalAaveLendsDailyEntry[], cur: GlobalAaveLendsEntry) => {
        let lastEntry = acc[acc.length - 1]
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.aUsdcInterestJuniorNet += cur.aUsdcInterestJunior
          lastEntry.aUsdcInterestSeniorNet += cur.aUsdcInterestSenior
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days < timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              aUsdcInterestJuniorNet: 0,
              aUsdcInterestSeniorNet: 0
            })
            lastEntry = acc[acc.length - 1]
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            aUsdcInterestJuniorNet: cur.aUsdcInterestJunior,
            aUsdcInterestSeniorNet: cur.aUsdcInterestSenior
          })
        }
        return acc
      },
      []
    ),
    dataLength: data.length,
    totalAUsdcInterestJunior: combinedData.reduce(
      (acc, cur) => acc + cur.aUsdcInterestJunior,
      0
    ),
    totalAUsdcInterestSenior: combinedData.reduce(
      (acc, cur) => acc + cur.aUsdcInterestSenior,
      0
    )
  }
}
