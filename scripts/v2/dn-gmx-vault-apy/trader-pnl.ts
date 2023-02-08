import 'isomorphic-unfetch'

import { fetchJson } from 'ethers/lib/utils'

import type {
  GlobalGlpPnlResult,
  GlobalMarketMovementResult,
  VaultInfoResult
} from '../../aggregated'
import { combineStatsData } from '../../aggregated/util/combineStatsData'

export const getTraderPnl = async () => {
  const [{ result: glpPnl }, { result: marketMovement }, { result: vaultInfo }] =
    await Promise.all([
      fetchJson({
        url: 'http://localhost:3000/data/aggregated/get-glp-pnl?networkName=arbmain',
        timeout: 1_000_000_000
      }) as Promise<{ result: GlobalGlpPnlResult }>,

      fetchJson({
        url: 'http://localhost:3000/data/aggregated/get-market-movement?networkName=arbmain',
        timeout: 1_000_000_000
      }) as Promise<{ result: GlobalMarketMovementResult }>,

      fetchJson({
        url: 'http://localhost:3000/data/aggregated/get-vault-info?networkName=arbmain',
        timeout: 1_000_000_000
      }) as Promise<{ result: VaultInfoResult }>
    ])

  const combined = combineStatsData(
    [glpPnl.dailyData || [], marketMovement.dailyData || []],
    'startTimestamp',
    ([glpPnlObj, mktMoveObj]) => {
      const Day = (glpPnlObj || mktMoveObj)?.startTimestamp
      if (!Day) throw new Error('All objects cannot be undefined')

      return {
        Day,
        totalTraderPnL: (glpPnlObj?.glpPnlNet || 0) - (mktMoveObj?.pnlNet || 0)
      }
    }
  )

  return vaultInfo.data
    .map((entry) => {
      const foundDay = combined.find((d) => d.Day === entry.timestamp)

      return (foundDay?.totalTraderPnL || 0) / entry.juniorVaultInfo.vaultMarketValue
    })
    .reduce((acc, curr) => acc + curr, 0)
}
