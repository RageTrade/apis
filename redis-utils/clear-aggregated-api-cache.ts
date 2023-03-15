import { getRedisClient } from './get-client'

export async function clearAggregatedApiCache() {
  const client = getRedisClient()
  let cursor: string | number = 0
  let keys = []
  let total = 0
  let total2 = 0
  while (cursor !== '0') {
    ;[cursor, keys] = await client.scan(cursor)
    for (const key of keys) {
      if (key.includes('aggregated')) {
        total2 += 1
        await client.del(key)
      }
    }
    total += keys.length
  }
  console.log('iteration completed on total keys:', total)
  console.log('deleted keys:', total2)
}
