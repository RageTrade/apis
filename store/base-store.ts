import Debugger from "debug";
const debug = Debugger("apis:base-store");
export interface Internal {
  [key: string]: string;
}

export class BaseStore<Value> {
  _promises = new Map<string, any>();
  _timestampPrepend = "__timestamp_";

  /**
   * Gets the value from storage, or sets it if it doesn't exist.
   * @param _key The key to get.
   * @param _valueFn Function that should return the value for setting if it doesn't exist.
   * @returns The value.
   */
  async getOrSet<V = Value>(
    key: string,
    valueFn: () => V | Promise<V>,
    secondsOld?: number
  ): Promise<V> {
    const read = await this.get<V>(key, secondsOld);

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

  /**
   * Gets the value from storage, or undefined if it doesn't exist.
   * @param _key The key to get.
   * @returns The value, or undefined if it doesn't exist.
   */
  async get<V = Value>(
    _key: string,
    secondsOld?: number
  ): Promise<V | undefined> {
    const value = this._get<V>(_key);
    // if value not present just return undefined immediately
    if (value === undefined) return undefined;
    if (value !== undefined && secondsOld !== undefined) {
      const creationTimestamp = await this._get<number>(
        this._timestampPrepend + _key
      );
      if (creationTimestamp === undefined) {
        // if there is no timestamp, set current timestamp
        await this._set(this._timestampPrepend + _key, currentTimestamp());
      } else if (creationTimestamp + secondsOld < currentTimestamp()) {
        // if the timestamp is older than the secondsOld, delete the value
        await this._set(_key, undefined);
        return undefined;
      }
    }
    return value;
  }

  /**
   * Sets the value in storage.
   * @param _key The key to set.
   * @param _value The value to set.
   * @returns Promise that resolves when the value is set.
   */
  async set<V = Value>(_key: string, _value: V): Promise<void> {
    // set value
    await this._set(_key, _value);
    // set timestamp
    await this._set(this._timestampPrepend + _key, currentTimestamp());
  }

  /**
   * Override this method in a subclass to implement a custom storage backend.
   */
  async _get<V = Value>(_key: string): Promise<V | undefined> {
    throw new Error("BaseStore._get: method not implemented.");
  }

  /**
   * Override this method in a subclass to implement a custom storage backend.
   */
  async _set<V = Value>(_key: string, _value: V): Promise<void> {
    throw new Error("BaseStore._set: method not implemented.");
  }
}

function currentTimestamp() {
  return Math.floor(Date.now() / 1000);
}
