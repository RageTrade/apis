import 'isomorphic-unfetch'

import type { NetworkName } from '@ragetrade/sdk'
import { fetchJson } from 'ethers/lib/utils'

import type {
  GlobalGlpPnlResult,
  GlobalMarketMovementResult,
  VaultInfoResult
} from '../../aggregated'
import { combineStatsData } from '../../aggregated/util/combineStatsData'

export const getTraderPnl = async (networkName: NetworkName) => {
  const { result: glpPnl }: { result: GlobalGlpPnlResult } = await fetchJson({
    url: 'http://localhost:3000/data/aggregated/get-glp-pnl?networkName=' + networkName,
    timeout: 1000_00_00_00
  })

  const { result: marketMovement }: { result: GlobalMarketMovementResult } =
    await fetchJson({
      url:
        'http://localhost:3000/data/aggregated/get-market-movement?networkName=' +
        networkName,
      timeout: 1000_00_00_00
    })

  const { result: vaultInfo }: { result: VaultInfoResult } = await fetchJson({
    url:
      'http://localhost:3000/data/aggregated/get-vault-info?networkName=' + networkName,
    timeout: 1000_00_00_00
  })

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

  const data = vaultInfo.data.map((entry) => {
    const foundDay = combined.find((d) => d.Day === entry.timestamp)

    return (foundDay?.totalTraderPnL || 0) / entry.juniorVaultInfo.vaultMarketValue
  })

  const dataSum = data
    .filter((num) => !Number.isNaN(num) && Number.isFinite(num))
    .reduce((acc, curr) => acc + curr, 0)

  return dataSum * 100
}
