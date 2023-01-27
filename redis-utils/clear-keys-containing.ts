import { getRedisClient } from "./get-client";

export async function clearKeysContaining(match: (key: string) => boolean) {
  const client = getRedisClient();
  let cursor: string | number = 0;
  let keys = [];
  while (cursor !== "0") {
    [cursor, keys] = await client.scan(cursor);
    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl !== -1 && match(key)) {
        await client.del(key);
      }
    }
  }
}
