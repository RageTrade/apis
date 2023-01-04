import { RedisStore } from "./store/redis-store";
import { currentTimestamp } from "./utils";

interface Options {
  cacheSeconds?: number;
  tags?: string[];
}

// const cache = new MemoryStore<any>("cache");
const cache = new RedisStore<any>();
export function cacheFunctionResult<F extends (...args: any[]) => any>(
  fn: F,
  args: Parameters<F>,
  { cacheSeconds, tags }: Options = {}
) {
  tags = tags || [];
  return cache.getOrSet(
    fn.name + args.map((a) => String(a)).join("-") + tags,
    generateResponse.bind(null, fn, args, cacheSeconds ?? 0),
    cacheSeconds
  );
}

// includes error in the cache function output,
// this is needed for preventing someone to abuse
// an endpoint which does not cache due to revert
async function generateResponse(
  fn: Function,
  args: any[],
  cacheSeconds: number
) {
  try {
    const result = await fn(...args);
    if (result.result) {
      // allows to override `cacheTimestamp`
      return {
        ...result,
        cacheTimestamp: Math.min(
          result.cacheTimestamp ?? Number.MAX_SAFE_INTEGER,
          currentTimestamp()
        ),
        cacheSeconds,
      };
    } else {
      return { result, cacheTimestamp: currentTimestamp() };
    }
  } catch (error: any) {
    // cache the error resp (to prevent DoS, hitting with an input which reverts in middle
    return {
      error: error.message,
      status: error.status,
      cacheTimestamp: currentTimestamp(),
      cacheSeconds: Math.min(cacheSeconds, 15),
    };
  }
}

export async function flushall() {
  await cache.client.flushall();
}
