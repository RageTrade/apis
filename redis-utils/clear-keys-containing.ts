import { getRedisClient } from './get-client'

export async function clearKeysContaining(
  match: (key: string) => boolean,
  _onlyTemporary: boolean | 'true' | 'false' = true
) {
  const onlyTemporary = _onlyTemporary === true || _onlyTemporary === 'true'
  const client = getRedisClient()
  let cursor: string | number = 0
  let keys = []
  let count = 0
  let deleted = 0
  while (cursor !== '0') {
    ;[cursor, keys] = await client.scan(cursor)
    for (const key of keys) {
      const ttl = onlyTemporary ? await client.ttl(key) : -2
      if (ttl !== -1 && match(key)) {
        await client.del(key)
        deleted++
      }
      count += keys.length
    }
  }
  console.log('iteration completed on total keys:', count)
  console.log('deleted keys:', deleted)
}
