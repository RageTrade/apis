import redis from "ioredis";
import { getRedisClient } from "./get-client";

export async function clearNonPersistentCache() {
  const client = getRedisClient();
  let cursor: string | number = 0;
  let keys = [];
  let total = 0;
  let total2 = 0;
  while (cursor !== "0") {
    [cursor, keys] = await client.scan(cursor);
    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl !== -1) {
        total2 += 1;
        await client.del(key);
      }
    }
    total += keys.length;
  }
  console.log("iteration completed on total keys:", total);
  console.log("deleted keys:", total2);
}
