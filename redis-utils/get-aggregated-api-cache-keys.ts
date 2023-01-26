import redis from "ioredis";
import { getRedisClient } from "./get-client";

export async function getAggregatedApiCacheKeys() {
  let cursor: string | number = 0;
  let keys = [];
  let result = [];
  const client = getRedisClient();
  while (cursor !== "0") {
    [cursor, keys] = await client.scan(cursor);
    for (const key of keys) {
      if (key.includes("aggregated")) {
        result.push(key);
      }
    }
  }
  return result;
}
