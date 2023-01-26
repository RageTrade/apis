import { Redis } from "ioredis";
import { BaseStore } from "./base-store";
import Debugger from "debug";

const debug = Debugger("apis:redis-store");

export class RedisStore<Value> extends BaseStore<Value> {
  client: Redis;
  queries: Array<{ key: string; valueFn: () => any; expirySeconds: number }> =
    [];
  updatingCache = false;

  constructor({
    client,
    updateCache = true,
  }: {
    client: Redis;
    updateCache?: boolean;
  }) {
    super();
    this.client = client;
    if (!updateCache) {
      this.updatingCache = true; // does not trigger cache update
    }
  }

  /**
   * Get a value from the store, or set it if needed and it doesn't exist.
   * @param key The key to get or set.
   * @param valueFn The function to call to get the value if it doesn't exist.
   * @param expirySeconds -1 for persistent cache, 0 for no cache, > 0 for expiry in seconds
   * @returns value if present in cache
   */
  async getOrSet<V = Value>(
    key: string,
    valueFn: () => V | Promise<V>,
    expirySeconds: number
  ): Promise<V> {
    this.startCacheUpdater({ key, valueFn, expirySeconds });

    // do not read cache if expiry is 0
    const read = expirySeconds !== 0 ? await this.get<V>(key) : undefined;

    let valuePromise = this._promises.get(key);
    if (read !== undefined) {
      debug("RedisStore.getOrSet: returning the value present in storage");
      return read;
    } else if (valuePromise) {
      debug("RedisStore.getOrSet: value being queried already, waiting for it");
      return await valuePromise;
    } else {
      debug("RedisStore.getOrSet: value not present in storage, fetching it");
      valuePromise = valueFn();
      if (valuePromise instanceof Promise) {
        this._promises.set(key, valuePromise);
      }
      try {
        const value = await valuePromise;
        // override expirySeconds if cacheSeconds is provided
        if (typeof value.cacheSeconds === "number") {
          expirySeconds = value.cacheSeconds;
        }
        // do not write to cache if expiry is 0
        if (expirySeconds !== 0) {
          await this.set<V>(key, value, expirySeconds);
        }
        this._promises.set(key, undefined);
        return value;
      } catch (e) {
        this._promises.set(key, undefined);
        throw e;
      }
    }
  }

  async get<V = Value>(_key: string): Promise<V | undefined> {
    const valueStr = await this.client.get(_key);
    if (valueStr === null) return undefined;
    return JSON.parse(valueStr) as V;
  }

  async set<V = Value>(
    _key: string,
    _value: V,
    expirySeconds: number = -1
  ): Promise<void> {
    if (expirySeconds === -1) {
      // cache with no expiry (persistent)
      debug(`RedisStore.set: setting key ${_key} with no expiry`);
      await this.client.set(_key, JSON.stringify(_value));
    } else if (expirySeconds === 0) {
      // no cache
      await this.client.del(_key);
    } else {
      // cache with expiry
      debug(
        `RedisStore.set: setting key ${_key} with expiry ${expirySeconds} seconds`
      );
      await this.client.set(_key, JSON.stringify(_value), "EX", expirySeconds);
    }
  }

  async startCacheUpdater(newQuery: {
    key: string;
    valueFn: () => any;
    expirySeconds: number;
  }) {
    if (newQuery.key.toLowerCase().includes("address")) {
      return; // do not include these queries in cache updater
    }
    if (!this.updatingCache) {
      debug("initiate update cache");
      this.updatingCache = true;
      this.queries = this.queries.slice(-200); // use only recent 200 entries
      const _queries = this.queries;
      if (!this.queries.find((q) => q.key === newQuery.key)) {
        this.queries.push(newQuery);
      }

      debug(
        `RedisStore.updateCache: updating cache with ${this.queries.length} queries`
      );
      for (const query of _queries) {
        try {
          debug(`RedisStore.updateCache: query ${query.key}`);
          await this.getOrSet(query.key, query.valueFn, query.expirySeconds);
        } catch {}
      }
      debug("RedisStore.updateCache: cache updated");

      this.updatingCache = false;
    }
  }
}
