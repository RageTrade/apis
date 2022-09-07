import { MemoryStore } from "./store/memory-store";

const cache = new MemoryStore<any>("cache");
export function cacheFunctionResult<F extends (...args: any[]) => any>(
  fn: F,
  args: Parameters<F>,
  cacheSeconds: number
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
    return { result };
  } catch (error: any) {
    return { error };
  }
}
