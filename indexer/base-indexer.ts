import { ethers, EventFilter } from "ethers";

import { NetworkName } from "@ragetrade/sdk";

import { getProvider } from "../providers";
import { BaseStore } from "../store/base-store";

/**
 * @description BaseIndexer is a base class for indexers.
 *  This should be inherited and `static getStore`, `getFilter`, `forEachLog` should be implemented.
 */
export class BaseIndexer<DataStoreType> {
  _networkName: NetworkName;
  _provider: ethers.providers.Provider;
  _syncedBlock: number;
  _store: BaseStore<DataStoreType> | undefined;

  constructor(networkName: NetworkName) {
    this._syncedBlock = -1;
    this._networkName = networkName;
    this._provider = getProvider(networkName);
  }

  getStore(): BaseStore<DataStoreType> {
    throw new Error("static BaseIndexer.getStore: method not implemented.");
  }

  getCachedStoreObject(): BaseStore<DataStoreType> {
    if (this._store) {
      return this._store;
    }
    this._store = this.getStore();
    return this._store;
  }

  async getFilter(
    _provider: ethers.providers.Provider
  ): Promise<ethers.EventFilter> {
    throw new Error("BaseIndexer.getFilter: method not implemented.");
  }

  async forEachLog(_log: ethers.providers.Log) {
    throw new Error("BaseIndexer.forEachLog: method not implemented.");
  }

  private async ready() {
    this._syncedBlock = Number(
      await this.getCachedStoreObject().getOrSet<string>("synced-block", () =>
        String(this._syncedBlock - 1)
      )
    );
  }

  async start(
    startBlock: number,
    blockInterval: number,
    iterWait?: number,
    err?: (err: any) => void
  ) {
    this._syncedBlock = startBlock - 1;
    while (1) {
      try {
        await this.run(blockInterval);
      } catch (e) {
        if (err) {
          err(e);
        } else {
          console.error(e);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, iterWait ?? 5000));
    }
  }

  private async run(blockInterval: number) {
    await this.ready();
    console.log(this._networkName, "indexer ready");

    const filter = await this.getFilter(this._provider);

    const latestBlock = await this._provider.getBlockNumber();
    const store = this.getCachedStoreObject();
    while (this._syncedBlock < latestBlock) {
      const { logs, fromBlock, toBlock } = await this.getLogs(
        filter,
        latestBlock,
        blockInterval
      );

      let latestBlockWithLogs = fromBlock;
      for (const log of logs) {
        latestBlockWithLogs = Math.max(latestBlockWithLogs, log.blockNumber);
        await this.forEachLog(log);
      }
      this._syncedBlock = toBlock;
      await store.set<string>(
        "synced-block",
        // store the block in which we got logs
        String(Math.max(this._syncedBlock, latestBlockWithLogs))
      );
    }
  }

  private async getLogs(
    filter: EventFilter,
    latestBlock: number,
    blockInterval: number
  ): Promise<{
    logs: ethers.providers.Log[];
    fromBlock: number;
    toBlock: number;
  }> {
    let fromBlock = this._syncedBlock + 1;
    let toBlock: number = Math.min(
      this._syncedBlock + blockInterval,
      latestBlock
    );
    let logs: ethers.providers.Log[] | undefined;

    while (logs === undefined) {
      try {
        console.log(this._networkName, "getLogs", fromBlock, toBlock);
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
}
