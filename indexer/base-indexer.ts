import type { NetworkName } from '@ragetrade/sdk'
import type { ethers, EventFilter } from 'ethers'

import { getProviderAggregate } from '../providers'
import type { BaseStore } from '../store/base-store'
import { getLogs } from '../utils'

/**
 * @description BaseIndexer is a base class for indexers.
 *  This should be inherited and `static getStore`, `getFilter`, `forEachLog` should be implemented.
 */
export class BaseIndexer<DataStoreType> {
  _networkName: NetworkName
  _provider: ethers.providers.Provider
  _store: BaseStore<DataStoreType> | undefined
  _keyPrepend: string | undefined

  constructor(networkName: NetworkName) {
    this._networkName = networkName
    this._provider = getProviderAggregate(networkName)
  }

  getStore(): BaseStore<DataStoreType> {
    throw new Error('static BaseIndexer.getStore: method not implemented.')
  }

  async getFilter(_provider: ethers.providers.Provider): Promise<ethers.EventFilter> {
    throw new Error('BaseIndexer.getFilter: method not implemented.')
  }

  async forEachLog(_log: ethers.providers.Log) {
    throw new Error('BaseIndexer.forEachLog: method not implemented.')
  }

  async get(key: 'synced-block'): Promise<number>
  async get(key: string): Promise<DataStoreType | undefined>
  async get(key: string): Promise<any> {
    const val = await this._getCachedStoreObject().get(this._getKey(key))
    if (typeof val === 'string') {
      return JSON.parse(val)
    }
    return val
  }

  async set(key: 'synced-block', value: number): Promise<void>
  async set(key: string, value: DataStoreType): Promise<void>
  async set(key: string, value: any): Promise<void> {
    await this._getCachedStoreObject().set(this._getKey(key), JSON.stringify(value))
  }

  private _getKey(key: string) {
    return `${this._keyPrepend ?? 'base-indexer'}-${key}`
  }

  private _getCachedStoreObject(): BaseStore<DataStoreType> {
    if (this._store) {
      return this._store
    }
    this._store = this.getStore()
    return this._store
  }

  private async _getOrUpdateSyncBlock(syncedBlock?: number) {
    const storedSyncedBlock = await this.get('synced-block')
    if (storedSyncedBlock === undefined) {
      if (syncedBlock !== undefined) {
        await this.set('synced-block', syncedBlock)
      } else {
        throw new Error('syncedBlock and storedSyncedBlock both are undefined')
      }
    } else {
      if (syncedBlock !== undefined) {
        await this.set('synced-block', Math.max(syncedBlock, storedSyncedBlock))
      }
    }
    return this.get('synced-block')
  }

  async start(startBlock: number, iterWait?: number, err?: (err: any) => void) {
    console.log(this._networkName, 'indexer starting')
    await this._getOrUpdateSyncBlock(startBlock - 1)
    while (1) {
      try {
        await this.run()
      } catch (e) {
        if (err) {
          err(e)
        } else {
          console.error(e)
        }
      }
      await new Promise((resolve) => setTimeout(resolve, iterWait ?? 5000))
    }
  }

  private async run() {
    const filter = await this.getFilter(this._provider)
    const latestBlock = await this._provider.getBlockNumber()

    let syncedBlock = await this._getOrUpdateSyncBlock()
    console.log(this._networkName, 'run', { syncedBlock, latestBlock })

    while (syncedBlock < latestBlock) {
      const logs = await getLogs(
        filter,
        syncedBlock + 1,
        latestBlock,
        this._provider,
        this._networkName
      )

      for (const log of logs) {
        await this.forEachLog(log)
      }

      syncedBlock = latestBlock
      await this._getOrUpdateSyncBlock(latestBlock)
    }
  }
}
