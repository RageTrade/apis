import Debugger from 'debug'

import { currentTimestamp } from '../utils'
const debug = Debugger('apis:base-store')
export interface Internal {
  [key: string]: string
}

export class BaseStore {
  _promises = new Map<string, Promise<any>>()
  _timestampPrepend = '__timestamp_'

  /**
   * Gets the value from storage, or sets it if it doesn't exist.
   * @param _key The key to get.
   * @param _valueFn Function that should return the value for setting if it doesn't exist.
   * @returns The value.
   */
  async getOrSet<V>(
    key: string,
    valueFn: () => V | Promise<V>,
    secondsOld?: number
  ): Promise<V> {
    const read = await this.get<V>(key, secondsOld)

    const valuePromise = this._promises.get(key)

    if (read !== undefined) {
      debug('getOrSet: returning the value present in storage')

      return read
    } else if (valuePromise) {
      debug('getOrSet: value being queried already, waiting for it')

      return valuePromise
    } else {
      debug('getOrSet: value not present in storage, fetching it')

      const newValuePromise = valueFn()

      if (newValuePromise instanceof Promise) {
        this._promises.set(key, newValuePromise)
      }

      try {
        const value = await newValuePromise
        await this.set(key, value)
        this._promises.delete(key)

        return value
      } catch (e) {
        this._promises.delete(key)
        throw e
      }
    }
  }

  /**
   * Gets the value from storage, or undefined if it doesn't exist.
   * @param key The key to get.
   * @returns The value, or undefined if it doesn't exist.
   */
  async get<V>(key: string, secondsOld?: number): Promise<V | undefined> {
    const value = this._get<V>(key)
    // if value not present just return undefined immediately
    if (value === undefined) return undefined
    if (value !== undefined && secondsOld !== undefined) {
      const creationTimestamp = await this._get<number>(this._timestampPrepend + key)
      if (creationTimestamp === undefined && !!this._timestampPrepend) {
        // if there is no timestamp, set current timestamp
        await this._set(this._timestampPrepend + key, currentTimestamp())
      } else if (
        creationTimestamp !== undefined &&
        creationTimestamp !== -1 &&
        creationTimestamp + secondsOld < currentTimestamp()
      ) {
        // if the timestamp is older than the secondsOld, delete the value
        await this._set(key, undefined)
        return undefined
      }
    }
    return value
  }

  /**
   * Sets the value in storage.
   * @param key The key to set.
   * @param value The value to set.
   * @returns Promise that resolves when the value is set.
   */
  async set<V>(key: string, value: V): Promise<void> {
    // set value
    await this._set(key, value)
    // set timestamp
    if (this._timestampPrepend) {
      await this._set(this._timestampPrepend + key, currentTimestamp())
    }
  }

  /**
   * Override this method in a subclass to implement a custom storage backend.
   */
  async _get<V>(key: string): Promise<V | undefined> {
    throw new Error('BaseStore._get: method not implemented.')
  }

  /**
   * Override this method in a subclass to implement a custom storage backend.
   */
  async _set<V>(key: string, _value: V): Promise<void> {
    throw new Error('BaseStore._set: method not implemented.')
  }
}
