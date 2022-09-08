import redis from "ioredis";
import { Redis } from "ioredis";
import { BaseStore } from "./base-store";
import Debugger from "debug";

const debug = Debugger("apis:redis-store");

export class RedisStore<Value> extends BaseStore<Value> {
  client: Redis;
  constructor() {
    super();
    this.client = redis.createClient();
  }

  async getOrSet<V = Value>(
    key: string,
    valueFn: () => V | Promise<V>,
    expirySeconds?: number
  ): Promise<V> {
    const read = await this.get<V>(key);

    let valuePromise = this._promises.get(key);
    if (read !== undefined) {
      debug("getOrSet: returning the value present in storage");
      return read;
    } else if (valuePromise) {
      debug("getOrSet: value being queried already, waiting for it");
      return await valuePromise;
    } else {
      debug("getOrSet: value not present in storage, fetching it");
      valuePromise = valueFn();
      if (valuePromise instanceof Promise) {
        this._promises.set(key, valuePromise);
      }
      try {
        const value = await valuePromise;
        await this.set<V>(key, value);
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
      this.client.set(_key, JSON.stringify(_value), "EX", expirySeconds);
    } else {
      this.client.set(_key, JSON.stringify(_value));
    }
  }
}
