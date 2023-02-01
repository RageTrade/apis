import { ClearingHouse__factory, core } from '@ragetrade/sdk'
import type { AccountCreatedEvent } from '@ragetrade/sdk/dist/typechain/core/contracts/interfaces/IClearingHouse'
import type { ethers } from 'ethers'

import type { BaseStore } from '../store/base-store'
import { FileStore } from '../store/file-store'
import { BaseIndexer } from './base-indexer'

const iface = ClearingHouse__factory.createInterface()

export class AccountCreatedIndexer extends BaseIndexer<number[]> {
  _keyPrepend = 'account-created-indexer'

  getStore(): BaseStore<number[]> {
    return new FileStore<number[]>(`data/${this._networkName}/accounts-created`)
  }

  async getFilter(provider: ethers.providers.Provider): Promise<ethers.EventFilter> {
    const { clearingHouse } = await core.getContracts(provider)
    return clearingHouse.filters.AccountCreated()
  }

  async forEachLog(log: ethers.providers.Log) {
    console.log('for each')
    const parsed = iface.parseLog(log) as unknown as AccountCreatedEvent
    const accountIds = (await this.get(parsed.args.ownerAddress)) ?? []
    accountIds.push(parsed.args.accountId.toNumber())
    await this.set(parsed.args.ownerAddress, accountIds)
  }
}
