import type { Log } from '@ethersproject/providers'
import type { NetworkName } from '@ragetrade/sdk'
import type { ethers } from 'ethers'

import { JsonStore } from '../store/json-store'
import { BaseIndexer } from './base-indexer'

const LOGS_KEY = 'logs'
export class SimpleEventCache extends BaseIndexer<Log[]> {
  _filter: ethers.EventFilter

  constructor(networkName: NetworkName, filter: ethers.EventFilter) {
    super(networkName)
    this._filter = filter
  }

  getStore() {
    return new JsonStore<Log[]>(
      `data/${this._networkName}/logs/${this._filter.address ?? 'empty-addr'}/${
        this._filter.topics?.join('-') ?? 'empty-topics'
      }.json`,
      true
    )
  }

  async getEvents(): Promise<Log[]> {
    return this.getStore()
      .get<Log[]>(LOGS_KEY)
      .then((events) => events || [])
  }

  async getFilter(_provider: ethers.providers.Provider): Promise<ethers.EventFilter> {
    return this._filter
  }

  async forEachLog(log: ethers.providers.Log) {
    console.log('for each')
    const store = this.getStore()
    const events = await store.getOrSet<Log[]>(LOGS_KEY, () => [])
    events.push(log)
    await store.set(LOGS_KEY, events)
  }
}
