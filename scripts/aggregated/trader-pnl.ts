import '../../fetch-polyfill'

import { deltaNeutralGmxVaults, tokens } from '@ragetrade/sdk'
import { fetchJson, formatEther, formatUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { days, fetchRetry, timestampRoundDown } from '../../utils'

export interface GlobalTraderPnlEntry {
  blockNumber: number
  timestamp: number
  profit: number
  loss: number
  traderPnlGmxGlobal: number
  vaultShare: number
  traderPnlVault: number
}

export interface GlobalTraderPnlDailyEntry {
  startTimestamp: number
  endTimestamp: number
  traderPnlGmxGlobalNet: number
  traderPnlVaultNet: number
}

export interface GlobalTraderPnlResult {
  data: GlobalTraderPnlEntry[]
  dailyData: GlobalTraderPnlDailyEntry[]
  dataLength: number
  traderPnlNet: number
  traderPnlVaultNet: number
}

export async function getTraderPnl(
  excludeRawData: boolean
): Promise<GlobalTraderPnlResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-trader-pnl`,
      timeout: 1_000_000_000 // huge number
    })
    delete resp.result.data
    return resp.result
  }

  const START_BLOCK = 45412300

  const provider = getProviderAggregate('arbmain')

  const { glp, fsGLP } = await tokens.getContracts(provider)

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    await deltaNeutralGmxVaults.getContracts(provider)

  const gmxSubgraphUrl = 'https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats'

  const queryTraderData = async (from_ts: string, to_ts: string) => {
    const results = await fetchRetry(gmxSubgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query gmxTraderStats {
            tradingStats(
              first: 1000
              orderBy: timestamp
              orderDirection: desc
              where: { period: "daily", timestamp_gte: ${from_ts}, timestamp_lte: ${to_ts} }
              subgraphError: allow
            ) {
              timestamp
              profit
              loss
              profitCumulative
              lossCumulative
              longOpenInterest
              shortOpenInterest
            }
          }
        `
      })
    })

    return (await results.json()).data
  }

  const currentDate = new Date()
  const to_ts = Math.floor(currentDate.getTime() / 1000).toString()
  const from_ts = (await provider.getBlock(START_BLOCK)).timestamp.toString()

  // let traderPnl = [];
  // let vaultShare = [];
  // let traderPnlVault = 0;

  const traderData = await queryTraderData(from_ts, to_ts)

  const tradingStats = (
    traderData.tradingStats as {
      blockNumber: number
      timestamp: number
      profit: string
      loss: string
      profitCumulative: string
      lossCumulative: string
      longOpenInterest: string
      shortOpenInterest: string
    }[]
  ).sort((a, b) => a.timestamp - b.timestamp)

  const data = []
  // {
  //   traderPnl: number;
  //   vaultShare: number;
  //   traderPnlVault: number;
  // }[] = [];

  for (const each of tradingStats) {
    const loss = Number(formatUnits(each.loss, 30))
    const profit = Number(formatUnits(each.profit, 30))

    const blockNumber = (
      await (
        await fetchRetry(`https://coins.llama.fi/block/arbitrum/${each.timestamp}`)
      ).json()
    ).height

    let vaultGlp
    let totalGlp
    while (1) {
      try {
        vaultGlp = Number(
          formatEther(
            (
              await dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
                blockTag: blockNumber
              })
            ).add(
              await fsGLP.balanceOf(dnGmxJuniorVault.address, {
                blockTag: blockNumber
              })
            )
          )
        )

        totalGlp = Number(formatEther(await glp.totalSupply({ blockTag: blockNumber })))
        break
      } catch {}
    }

    if (vaultGlp === undefined || totalGlp === undefined) {
      throw new Error('vaultGlp or totalGlp is undefined')
    }
    // traderPnl.push(profit - loss);
    // vaultShare.push(vaultGlp / totalGlp);
    const traderPnlGmxGlobal = profit - loss
    const vaultShare = vaultGlp / totalGlp
    const traderPnlVault = traderPnlGmxGlobal * vaultShare
    data.push({
      blockNumber,
      timestamp: each.timestamp,
      profit,
      loss,
      traderPnlGmxGlobal,
      vaultShare,
      traderPnlVault
    })
  }

  // for (const [index, pnl] of traderPnl.entries()) {
  //   traderPnlVault += pnl * vaultShare[index];
  // }

  return {
    data,
    dailyData: data.reduce(
      (acc: GlobalTraderPnlDailyEntry[], cur: GlobalTraderPnlEntry) => {
        const lastEntry = acc[acc.length - 1]
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.traderPnlGmxGlobalNet += cur.traderPnlGmxGlobal
          lastEntry.traderPnlVaultNet += cur.traderPnlVault
        } else {
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            traderPnlGmxGlobalNet: cur.traderPnlGmxGlobal,
            traderPnlVaultNet: cur.traderPnlVault
          })
        }
        return acc
      },
      []
    ),
    dataLength: data.length,
    traderPnlNet: data.reduce((acc, cur) => acc + cur.traderPnlVault, 0),
    traderPnlVaultNet: data.reduce((acc, cur) => acc + cur.traderPnlVault, 0)
  }
}
