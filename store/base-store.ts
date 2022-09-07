export interface Internal {
  [key: string]: string;
}

export class BaseStore<Value> {
  _promises: { [key: string]: Promise<any> | undefined } = {};
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
    if (read !== undefined) {
      // is value present in storage just return it
      return read;
    } else if (this._promises[key]) {
      // is value being queried by another request, wait for it
      const valuePromise = this._promises[key];
      return await valuePromise;
    } else {
      // is value not present in storage, not even being fetched, fetch it
      const valuePromise = valueFn();
      if (valuePromise instanceof Promise) {
        // set
        this._promises[key] = valuePromise;
        valuePromise.finally(() => {
          delete this._promises[key];
        });
      }
      const value = await valuePromise;
      await this.set<V>(key, value);
      return value;
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
