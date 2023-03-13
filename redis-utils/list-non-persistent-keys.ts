import { getRedisClient } from './get-client'

export async function listNonPersistentCache(limit = 50) {
  const client = getRedisClient()
  let cursor: string | number = 0
  let keys = []
  let total = 0
  let total2 = 0

  while (cursor !== '0') {
    ;[cursor, keys] = await client.scan(cursor)
    for (const key of keys) {
      const ttl = await client.ttl(key)
      if (ttl !== -1) {
        total2 += 1
        console.log(key)
      }
    }
    total += keys.length
    if (total2 > 50) {
      console.log(
        `Error: Keys more than ${limit} so terminating the printer. You can pass first arg as limit.`
      )
      break
    }
  }
  console.log('iteration completed on keys:', total)
}
