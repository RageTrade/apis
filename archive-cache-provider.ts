import type {
  Block,
  BlockTag,
  TransactionRequest
} from '@ethersproject/abstract-provider'
import type { Networkish } from '@ethersproject/providers'
import type { ethers } from 'ethers'
import type { ConnectionInfo, Deferrable } from 'ethers/lib/utils'
import { id } from 'ethers/lib/utils'

import { getRedisClient } from './redis-utils/get-client'
import { RetryProvider } from './retry-provider'
import { RedisStore } from './store/redis-store'

export class ArchiveCacheProvider extends RetryProvider {
  // store: FileStore<string>;
  redisStore: RedisStore
  forkBlockNumber: number | undefined
  originalProvider: ethers.providers.Provider | undefined

  constructor(
    url?: ConnectionInfo | string,
    network?: Networkish,
    forkBlockNumber?: number,
    originalProvider?: ethers.providers.Provider
  ) {
    super(url, network)
    if (typeof network !== 'number') {
      throw new Error('Second arg of ArchiveCacheProvider must be a chainId number')
    }
    // this.store = new FileStore(
    //   path.resolve(__dirname, `data/_archive/${network}/`)
    // );
    this.redisStore = new RedisStore({
      client: getRedisClient(),
      updateCache: false
    })
    this.forkBlockNumber = forkBlockNumber
    this.originalProvider = originalProvider
  }

  async call(
    transaction: Deferrable<TransactionRequest>,
    blockTag?: BlockTag | Promise<BlockTag>
  ): Promise<string> {
    if (typeof blockTag === 'number') {
      const key = getKey([
        this.network.name,
        'call',
        String(blockTag),
        (await transaction.to) ?? 'no-to',
        id([transaction.to ?? '', transaction.data ?? '', blockTag].join('-'))
      ])
      return this.redisStore.getOrSet(
        key,
        async () => {
          if (
            this.forkBlockNumber &&
            this.originalProvider &&
            blockTag <= this.forkBlockNumber
          ) {
            return this.originalProvider.call(transaction, blockTag)
          } else {
            return super.call(transaction, blockTag)
          }
        },
        -1
      )
    } else {
      return super.call(transaction, blockTag)
    }
  }

  async getBlock(
    blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>
  ): Promise<Block> {
    if (typeof blockHashOrBlockTag === 'number') {
      const key = getKey([this.network.name, 'getBlock', String(blockHashOrBlockTag)])
      return this.redisStore.getOrSet(
        key,
        async () => {
          if (
            this.forkBlockNumber &&
            this.originalProvider &&
            blockHashOrBlockTag <= this.forkBlockNumber
          ) {
            return this.originalProvider.getBlock(blockHashOrBlockTag)
          } else {
            return super.getBlock(blockHashOrBlockTag)
          }
        },
        -1
      )
    } else {
      return super.getBlock(blockHashOrBlockTag)
    }
  }

  async getLogs(filter: ethers.providers.Filter): Promise<Array<ethers.providers.Log>> {
    if (typeof filter.toBlock === 'number' && typeof filter.fromBlock === 'number') {
      const key = getKey([
        this.network.name,
        'getLogs',
        String(filter.fromBlock),
        String(filter.toBlock),
        filter.topics?.join('-') ?? 'no-topics'
      ])
      return this.redisStore.getOrSet(
        key,
        async () => {
          if (
            this.forkBlockNumber &&
            this.originalProvider &&
            typeof filter.toBlock === 'number' && // for typescript
            filter.toBlock <= this.forkBlockNumber
          ) {
            return this.originalProvider.getLogs(filter)
          } else {
            return super.getLogs(filter)
          }
        },
        -1
      )
    } else {
      return super.getLogs(filter)
    }
  }

  async send(method: string, params: any): Promise<any> {
    if (method === 'eth_getTransactionReceipt') {
      const key = getKey([this.network.name, 'send', method, ...params])
      return this.redisStore.getOrSet(key, async () => super.send(method, params), -1)
    } else {
      return super.send(method, params)
    }
  }
}

function getKey(items: string[]) {
  return 'archive-cache-provider-' + items.join('-')
}
