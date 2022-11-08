import redis from "ioredis";
import { Redis } from "ioredis";
import { BaseStore } from "./base-store";
import Debugger from "debug";

const debug = Debugger("apis:redis-store");

export class RedisStore<Value> extends BaseStore<Value> {
  client: Redis;
  queries: Array<{ key: string; valueFn: () => any; expirySeconds?: number }> =
    [];
  updatingCache = false;

  constructor() {
    super();
    this.client = redis.createClient();
  }

  async getOrSet<V = Value>(
    key: string,
    valueFn: () => V | Promise<V>,
    expirySeconds?: number
  ): Promise<V> {
    this.startCacheUpdater({ key, valueFn, expirySeconds });

    const read = await this.get<V>(key);

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
        await this.set<V>(key, value, expirySeconds);
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
    expirySeconds?: number
  ): Promise<void> {
    if (expirySeconds) {
      debug(
        `RedisStore.set: setting key ${_key} with expiry ${expirySeconds} seconds`
      );
      this.client.set(_key, JSON.stringify(_value), "EX", expirySeconds);
    } else {
      debug(`RedisStore.set: setting key ${_key} with no expiry`);
      this.client.set(_key, JSON.stringify(_value));
    }
  }

  async startCacheUpdater(newQuery: {
    key: string;
    valueFn: () => any;
    expirySeconds?: number;
  }) {
    if (newQuery.key.startsWith("getAccountIdsByAddress")) {
      return; // do not include these queries in cache updater
    }
    if (!this.updatingCache) {
      debug("initiate update cache");
      this.updatingCache = true;
      this.queries = this.queries.slice(-100); // use only recent 100 entries
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
