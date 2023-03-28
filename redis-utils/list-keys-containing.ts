import { getRedisClient } from './get-client'

export async function listKeysContaining(
  match: (key: string) => boolean,
  _onlyTemporary: boolean | 'true' | 'false' = true
) {
  let cursor: string | number = 0
  let keys = []
  const result = []
  const client = getRedisClient()
  while (cursor !== '0') {
    ;[cursor, keys] = await client.scan(cursor)
    for (const key of keys) {
      if (match(key)) {
        result.push(key)
      }
    }
  }
  return result
}
