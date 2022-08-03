import { ethers, EventFilter } from "ethers";

import { BaseStore } from "../store/base-store";

/**
 * @description BaseIndexer is a base class for indexers.
 *  This should be inherited and `getFilter` and `forEachLog` should be implemented.
 */
export class BaseIndexer<DataStoreType> {
  _syncedBlock: number;
  _blockInterval: number;
  _store: BaseStore<DataStoreType>;
  _provider: ethers.providers.Provider;

  constructor(
    startBlock: number,
    blockInterval: number,
    store: BaseStore<DataStoreType>,
    provider: ethers.providers.Provider
  ) {
    this._syncedBlock = startBlock - 1;
    this._blockInterval = blockInterval;
    this._store = store;
    this._provider = provider;
  }

  async ready() {
    this._syncedBlock = Number(
      await this._store.getOrSetInternal(
        "synced-block",
        String(this._syncedBlock - 1)
      )
    );
  }

  async resume() {
    await this.ready();
    console.log("indexer ready");

    const filter = await this.getFilter(this._provider);

    const latestBlock = await this._provider.getBlockNumber();
    while (this._syncedBlock < latestBlock) {
      const { logs, fromBlock, toBlock } = await this.getLogs(
        filter,
        latestBlock
      );

      let latestBlockWithLogs = fromBlock;
      for (const log of logs) {
        latestBlockWithLogs = Math.max(latestBlockWithLogs, log.blockNumber);
        await this.forEachLog(log);
      }
      this._syncedBlock = toBlock;
      await this._store.setInternal(
        "synced-block",
        // store the block in which we got logs
        String(Math.max(this._syncedBlock, latestBlockWithLogs))
      );
    }
  }

  async getLogs(
    filter: EventFilter,
    latestBlock: number
  ): Promise<{
    logs: ethers.providers.Log[];
    fromBlock: number;
    toBlock: number;
  }> {
    let blockInterval = this._blockInterval;
    let fromBlock = this._syncedBlock + 1;
    let toBlock: number = Math.min(
      this._syncedBlock + blockInterval,
      latestBlock
    );
    let logs: ethers.providers.Log[] | undefined;

    while (logs === undefined) {
      try {
        console.log("getLogs", fromBlock, toBlock);
        logs = await this._provider.getLogs({
          ...filter,
          fromBlock,
          toBlock,
        });
      } catch {
        // if query failed, re-try with a smaller block interval
        blockInterval = Math.floor(blockInterval / 2);
        toBlock = Math.min(this._syncedBlock + blockInterval, latestBlock);
        console.log("failed, new blockInterval:", blockInterval);
      }
    }

    return { logs, fromBlock, toBlock };
  }

  async getFilter(
    _provider: ethers.providers.Provider
  ): Promise<ethers.EventFilter> {
    throw new Error("LogIndexer.getFilter: method not implemented.");
  }

  async forEachLog(_log: ethers.providers.Log) {
    throw new Error("LogIndexer.forEachLog: method not implemented.");
  }
}
