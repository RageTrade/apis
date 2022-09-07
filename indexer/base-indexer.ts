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
  _blockInterval: number;
  _store: BaseStore<DataStoreType>;

  constructor(
    networkName: NetworkName,
    startBlock: number,
    blockInterval: number
  ) {
    this._syncedBlock = startBlock - 1;
    this._blockInterval = blockInterval;
    this._networkName = networkName;
    this._store = (this.constructor as any).getStore(this._networkName);
    this._provider = getProvider(networkName);
  }

  static getStore(networkName: NetworkName): BaseStore<any> {
    throw new Error("static BaseIndexer.getStore: method not implemented.");
  }

  async getFilter(
    _provider: ethers.providers.Provider
  ): Promise<ethers.EventFilter> {
    throw new Error("BaseIndexer.getFilter: method not implemented.");
  }

  async forEachLog(_log: ethers.providers.Log) {
    throw new Error("BaseIndexer.forEachLog: method not implemented.");
  }

  async ready() {
    this._syncedBlock = Number(
      await this._store.getOrSet<string>(
        "synced-block",
        String(this._syncedBlock - 1)
      )
    );
  }

  async start(iterWait?: number, err?: (err: any) => void) {
    while (1) {
      try {
        await this.run();
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

  async run() {
    await this.ready();
    console.log(this._networkName, "indexer ready");

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
      await this._store.set<string>(
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
