import { fetchJson } from 'ethers/lib/utils'
import cron from 'node-cron'

import { getAggregatedApiCacheKeys } from './redis-utils/get-aggregated-api-cache-keys'
import { getRedisClient } from './redis-utils/get-client'

// refresh aggregated api cache every day at 1am UTC
cron.schedule(
  '0 1 * * *',
  async () => {
    console.log('refreshing aggregated api cache')

    const keys = await getAggregatedApiCacheKeys()
    const client = getRedisClient()
    for (const key of keys) {
      await client.del(key)
    }
    console.log(`deleted ${keys.length} keys`)

    const apis = [
      'http://localhost:3000/data/aggregated/get-aave-pnl?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-glp-pnl?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-glp-slippage?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-glp-rewards?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-total-shares?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-uniswap-slippage?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-delta-spread?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-aave-lends?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-aave-borrows?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-trader-pnl?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-vault-info?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-market-movement?networkName=arbmain',
      'http://localhost:3000/data/aggregated/get-rebalance-info?networkName=arbmain'
    ]
    for (const api of apis) {
      // serially fetch each api to avoid overload
      await fetchJson({
        url: api,
        timeout: 1_000_000_000 // huge number
      })
    }
  },
  { scheduled: true, timezone: 'UTC' }
)
