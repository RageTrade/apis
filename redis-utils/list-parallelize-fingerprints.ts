import { getRedisClient } from './get-client'

export async function listAggregatedApiCacheKeys() {
  let cursor: string | number = 0
  let keys = []
  const result = []
  const client = getRedisClient()
  while (cursor !== '0') {
    ;[cursor, keys] = await client.scan(cursor)
    for (const key of keys) {
      if (key.startsWith('parallelize-fingerprint-')) {
        result.push(key)
      }
    }
  }
  return result
}
