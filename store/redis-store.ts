import Debugger from 'debug'
import type { Redis } from 'ioredis'

import type { CacheResponse } from '../cache'
import { currentTimestamp, years } from '../utils'
import { BaseStore } from './base-store'

const debug = Debugger('apis:redis-store')

/**
 * Cache in RedisStore is always infinite
 *
 * ```txt
 *  if there is data:
 *    if expired
 *       return cache & fetch/store
 *    if valid
 *       return from cache
 *  else:
 *   fetch and store
 * ```
 */

export class RedisStore extends BaseStore {
  client: Redis
  queries: Array<{
    key: string
    valueFn: () => any | Promise<any>
    expirySeconds: number
  }> = []
  updatingCache = false

  constructor({ client, updateCache = true }: { client: Redis; updateCache?: boolean }) {
    super()
    this.client = client
    if (!updateCache) {
      this.updatingCache = true // does not trigger cache update
    }
  }

  /**
   * Get a value from the store, or set it if needed and it doesn't exist.
   * @param key The key to get or set.
   * @param valueFn The function to call to get the value if it doesn't exist.
   * @param expirySeconds -1 for persistent cache, 0 for no cache, > 0 for expiry in seconds
   * @returns value if present in cache
   */
  async getOrSet<V>(
    key: string,
    valueFn: () => V | Promise<V>,
    expirySeconds: number
  ): Promise<V> {
    this.startCacheUpdater({ key, valueFn, expirySeconds })

    const fetchAndStore = async (): Promise<V> => {
      const result = valueFn()

      if (result instanceof Promise) {
        this._promises.set(key, result)
      }

      // we will cache results as well as errors
      const value = (await result) as Partial<CacheResponse>
      // override expirySeconds if cacheSeconds is provided
      if (typeof value?.cacheSeconds === 'number') {
        expirySeconds = value.cacheSeconds
      }
      // do not write to cache if expiry is 0
      if (expirySeconds !== 0) {
        await this.set(key, value, expirySeconds)
      }

      this._promises.delete(key)

      return value as V
    }
    // do not read cache if expiry is 0
    const cachedValue = expirySeconds !== 0 ? await this.get<V>(key) : undefined

    if (cachedValue) {
      debug('RedisStore.getOrSet: returning the value present in storage')

      const _cachedValue = cachedValue as Partial<CacheResponse>
      if (_cachedValue?.cacheTimestamp && _cachedValue?.cacheSeconds) {
        // return from cache and initiate cache update
        const isExpired =
          currentTimestamp() - _cachedValue.cacheTimestamp >= _cachedValue.cacheSeconds
        if (isExpired) {
          debug('RedisStore.getOrSet: cache expired starting refresh procedure')

          fetchAndStore()
        }
      }

      return cachedValue
    }

    const valuePromise = this._promises.get(key)

    if (valuePromise) {
      debug('RedisStore.getOrSet: value being queried already, waiting for it')

      return valuePromise
    } else {
      debug('RedisStore.getOrSet: value not present in storage, fetching it')

      return fetchAndStore()
    }
  }

  async get<V>(key: string): Promise<V | undefined> {
    const valueStr = await this.client.get(key)
    if (!valueStr) return

    return JSON.parse(valueStr) as V
  }

  async set<V>(key: string, value: V, expirySeconds = -1): Promise<void> {
    if (expirySeconds === -1) {
      // cache with no expiry (persistent)
      debug(`RedisStore.set: setting key ${key} with no expiry`)
      await this.client.set(key, JSON.stringify(value))
    } else if (expirySeconds === 0) {
      // no cache
      await this.client.del(key)
    } else {
      // cache with a very long expiry
      debug(`RedisStore.set: setting key ${key} with expiry ${expirySeconds} seconds`)

      await this.client.set(key, JSON.stringify(value), 'EX', 10 * years)
    }
  }

  async startCacheUpdater<V>(newQuery: {
    key: string
    valueFn: () => V | Promise<V>
    expirySeconds: number
  }) {
    if (newQuery.key.toLowerCase().includes('address')) {
      return // do not include these queries in cache updater
    }
    if (!this.updatingCache) {
      debug('initiate update cache')
      this.updatingCache = true
      this.queries = this.queries.slice(-200) // use only recent 200 entries
      const _queries = this.queries
      if (!this.queries.find((q) => q.key === newQuery.key)) {
        this.queries.push(newQuery)
      }

      debug(`RedisStore.updateCache: updating cache with ${this.queries.length} queries`)
      for (const query of _queries) {
        try {
          debug(`RedisStore.updateCache: query ${query.key}`)
          await this.getOrSet(query.key, query.valueFn, query.expirySeconds)
        } catch {
          debug(`RedisStore.updateCache: query failed ${query.key}`)
        }
      }
      debug('RedisStore.updateCache: cache updated')

      this.updatingCache = false
    }
  }
}
