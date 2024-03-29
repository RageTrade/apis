import type { NetworkName, ResultWithMetadata } from '@ragetrade/sdk'
import { fetchJson } from 'ethers/lib/utils'

import { days, safeDivNumer, timestampRoundDown } from '../../../utils'
import type { GlobalMarketMovementResult } from '../market-movement'
import { combine } from '../util/combine'
import type { Entry } from '../util/types'
import { matchWithNonOverlappingEntries } from './common'
import type { UserSharesResult } from './shares'

export type UserMarketMovementEntry = Entry<{
  timestamp: number

  userEthPnl: number
  userBtcPnl: number
  userLinkPnl: number
  userUniPnl: number
  userPnl: number
}>

export interface UserMarketMovementDailyEntry {
  startTimestamp: number
  endTimestamp: number

  userEthPnlNet: number
  userBtcPnlNet: number
  userLinkPnlNet: number
  userUniPnlNet: number
  userPnlNet: number
}

export interface UserMarketMovementResult {
  data: UserMarketMovementEntry[]
  dailyData: UserMarketMovementDailyEntry[]
  dataLength: number
  userTotalEthPnl: number
  userTotalBtcPnl: number
  userTotalLinkPnl: number
  userTotalUniPnl: number
  userTotalPnl: number
}

export async function getUserMarketMovement(
  networkName: NetworkName,
  userAddress: string,
  excludeRawData: boolean
): Promise<ResultWithMetadata<UserMarketMovementResult>> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-market-movement?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000 // huge number
    })
    delete resp.result.data
    return resp.result
  }

  const marketMovementResponse: ResultWithMetadata<GlobalMarketMovementResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-market-movement?networkName=${networkName}`,
      timeout: 1_000_000_000 // huge number
    })

  const userSharesResponse: ResultWithMetadata<UserSharesResult> = await fetchJson({
    url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
    timeout: 1_000_000_000 // huge number
  })

  const data = combine(
    marketMovementResponse.result.data,
    userSharesResponse.result.data,
    matchWithNonOverlappingEntries.bind(null, userSharesResponse.result.data),
    (marketMovementData, userSharesData) => ({
      ...userSharesData, // some of this data can get overriden by the next line
      ...marketMovementData,
      userEthPnl: safeDivNumer(
        marketMovementData.ethPnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userBtcPnl: safeDivNumer(
        marketMovementData.btcPnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userLinkPnl: safeDivNumer(
        marketMovementData.linkPnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userUniPnl: safeDivNumer(
        marketMovementData.uniPnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      ),
      userPnl: safeDivNumer(
        marketMovementData.pnl * userSharesData.userJuniorVaultShares,
        userSharesData.totalJuniorVaultShares
      )
    })
  )

  return {
    cacheTimestamp:
      marketMovementResponse.cacheTimestamp && userSharesResponse.cacheTimestamp
        ? Math.min(
            marketMovementResponse.cacheTimestamp,
            userSharesResponse.cacheTimestamp
          )
        : undefined,
    result: {
      data,
      dailyData: data.reduce(
        (acc: UserMarketMovementDailyEntry[], cur: UserMarketMovementEntry) => {
          let lastEntry = acc[acc.length - 1]
          if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
            lastEntry.userEthPnlNet += cur.userEthPnl
            lastEntry.userBtcPnlNet += cur.userBtcPnl
            lastEntry.userLinkPnlNet += cur.userLinkPnl
            lastEntry.userUniPnlNet += cur.userUniPnl
            lastEntry.userPnlNet += cur.userPnl
          } else {
            while (
              lastEntry &&
              lastEntry.startTimestamp + 1 * days < timestampRoundDown(cur.timestamp)
            ) {
              acc.push({
                startTimestamp: lastEntry.startTimestamp + 1 * days,
                endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
                userEthPnlNet: 0,
                userBtcPnlNet: 0,
                userLinkPnlNet: 0,
                userUniPnlNet: 0,
                userPnlNet: 0
              })
              lastEntry = acc[acc.length - 1]
            }
            acc.push({
              startTimestamp: timestampRoundDown(cur.timestamp),
              endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
              userEthPnlNet: cur.userEthPnl,
              userBtcPnlNet: cur.userBtcPnl,
              userLinkPnlNet: cur.userLinkPnl,
              userUniPnlNet: cur.userUniPnl,
              userPnlNet: cur.userPnl
            })
          }
          return acc
        },
        []
      ),
      dataLength: data.length,
      userTotalEthPnl: data.reduce(
        (acc: number, cur: UserMarketMovementEntry) => acc + cur.userEthPnl,
        0
      ),
      userTotalBtcPnl: data.reduce(
        (acc: number, cur: UserMarketMovementEntry) => acc + cur.userBtcPnl,
        0
      ),
      userTotalLinkPnl: data.reduce(
        (acc: number, cur: UserMarketMovementEntry) => acc + cur.userLinkPnl,
        0
      ),
      userTotalUniPnl: data.reduce(
        (acc: number, cur: UserMarketMovementEntry) => acc + cur.userUniPnl,
        0
      ),
      userTotalPnl: data.reduce(
        (acc: number, cur: UserMarketMovementEntry) => acc + cur.userPnl,
        0
      )
    }
  }
}
