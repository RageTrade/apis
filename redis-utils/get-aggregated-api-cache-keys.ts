import { getRedisClient } from './get-client'

export async function getAggregatedApiCacheKeys() {
  let cursor: string | number = 0
  let keys = []
  const result = []
  const client = getRedisClient()
  while (cursor !== '0') {
    ;[cursor, keys] = await client.scan(cursor)
    for (const key of keys) {
      if (key.includes('aggregated')) {
        result.push(key)
      }
    }
  }
  return result
}
