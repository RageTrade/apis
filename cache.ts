/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-shadow */

import { boolean } from 'zod'
import { getRedisClient } from './redis-utils/get-client'
import { RedisStore } from './store/redis-store'
import { currentTimestamp } from './utils'

interface Options {
  cacheSeconds: number
  tags?: string[]
}

const cache = new RedisStore({
  client: getRedisClient(),
  updateCache: true
})

type InferResultType<R> = R extends { result: infer T } ? T : R

export async function cacheFunctionResult<T, F extends (...args: any[]) => any>(
  fn: F,
  args: Parameters<F>,
  options?: Options
): Promise<CacheResponse<InferResultType<Awaited<ReturnType<F>>>>> {
  const { tags = [], cacheSeconds = 0 } = options || {}

  const key = [
    'cacheFunctionResult',
    ...tags,
    fn.name,
    ...args.map((a) => String(a))
  ].join('-')

  return cache.getOrSet(key, () => generateResponse(fn, args, cacheSeconds), cacheSeconds)
}

function doesResultExtendsResponse(
  result: any
): result is { result: any; cacheTimestamp?: number } {
  return typeof result === 'object' && result !== null && 'result' in result
}

type CacheMeta = {
  cacheTimestamp: number
  cacheSeconds: number
}

type CacheResponse<T> = CacheMeta &
  (
    | { result: T }
    | {
        error: string
        status: number
      }
  )

// includes error in the cache function output,
// this is needed for preventing someone to abuse
// an endpoint which does not cache due to revert
async function generateResponse<R, F extends (...args: any[]) => Promise<R>>(
  fn: F,
  args: Parameters<F>,
  cacheSeconds: number
): Promise<CacheResponse<InferResultType<R>>> {
  try {
    const result = await fn(...args)
    if (doesResultExtendsResponse(result)) {
      // allows to override `cacheTimestamp`
      return {
        ...result,
        cacheTimestamp: Math.min(
          result.cacheTimestamp ?? Number.MAX_SAFE_INTEGER,
          currentTimestamp()
        ),
        cacheSeconds
      }
    } else {
      return { result: result as any, cacheTimestamp: currentTimestamp(), cacheSeconds }
    }
  } catch (error: any) {
    if (error instanceof TypeError) {
      console.error('caught in generateResponse', error)
    }

    // cache the error resp (to prevent DoS, hitting with an input which reverts in middle
    if (error.status && error.status < 500) {
      // cache normal errors for 15 seconds
      return {
        error: error.message,
        status: error.status,
        cacheTimestamp: currentTimestamp(),
        cacheSeconds: Math.min(cacheSeconds, 15)
      }
    } else {
      return {
        error: error.message,
        status: error.status,
        cacheTimestamp: currentTimestamp(),
        cacheSeconds: Math.min(cacheSeconds, 15)
      }
    }
  }
}

export async function flushall() {
  await cache.client.flushall()
}
