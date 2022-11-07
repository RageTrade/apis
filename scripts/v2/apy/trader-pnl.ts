import 'isomorphic-unfetch';

const gmxSubgraphUrl = 'https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats'

const queryTraderData = async (from_ts: string, to_ts: string) => {

  const results = await fetch(gmxSubgraphUrl, {
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

  return ((await results.json()).data)
}

const queryFeesData = async (from_ts: string, to_ts: string) => {

  const results = await fetch(gmxSubgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query gmxFeeStats {
          feeStats(
            first: 1000
            orderBy: id
            orderDirection: desc
            where: { period: daily, id_gte: ${from_ts}, id_lte: ${to_ts} }
            subgraphError: allow
          ) {
            id
            margin
            marginAndLiquidation
            swap
            mint
            burn
          }
        }
      `
    })
  })

  return ((await results.json()).data)
}

const queryGlpData = async (from_ts: string, to_ts: string) => {

  const results = await fetch(gmxSubgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query gmxGlpStats {
          glpStats(
            first: 1000
            orderBy: id
            orderDirection: desc
            where: {
              period: daily
              id_gte: ${from_ts}
              id_lte: ${to_ts}
            }
            subgraphError: allow
          ) {
            id
            aumInUsdg
            glpSupply
            distributedUsd
            distributedEth
          }
        }
      `
    })
  })

  return ((await results.json()).data)
}

export const getTraderPnl = async () => {

  const currentDate = new Date()
  const threeMonthsOldDate = new Date()
  threeMonthsOldDate.setMonth(currentDate.getMonth() - 3)

  const to_ts = Math.floor(currentDate.getTime() / 1000).toString()
  const from_ts = Math.floor(threeMonthsOldDate.getTime() / 1000).toString()

  let aum = 0;
  let traderPnl = 0;

  const glpData = await queryGlpData(from_ts, to_ts)
  const traderData = await queryTraderData(from_ts, to_ts)

  for (const each of glpData.glpStats) {
    aum += each.aumInUsdg / 1e18;
  }

  for (const each of traderData.tradingStats ) {
    const loss = (each.loss / 1e30)
    const profit = (each.profit / 1e30)
    
    traderPnl += (profit - loss)
  }

  return aum > 0 
      ? (traderPnl / aum) * glpData.glpStats.length * 100 * -1
      : 0
}
