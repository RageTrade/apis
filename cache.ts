// import { MemoryStore } from "./store/memory-store";

import { RedisStore } from "./store/redis-store";
import { getTimestamp } from "./utils";

interface Options {
  cacheSeconds?: number;
}

// const cache = new MemoryStore<any>("cache");
const cache = new RedisStore<any>();
export function cacheFunctionResult<F extends (...args: any[]) => any>(
  fn: F,
  args: Parameters<F>,
  { cacheSeconds }: Options = {}
) {
  return cache.getOrSet(
    fn.name + args.map((a) => String(a)).join("-"),
    generateResponse.bind(null, fn, args),
    cacheSeconds
  );
}

// includes error in the cache function output,
// this is needed for preventing someone to abuse
// an endpoint which does not cache due to revert
async function generateResponse(fn: Function, args: any[]) {
  try {
    const result = await fn(...args);
    return { result, cacheTimestamp: getTimestamp() };
  } catch (error: any) {
    return { error, cacheTimestamp: getTimestamp() };
  }
}
