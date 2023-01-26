import {
  BlockTag,
  TransactionRequest,
  Block,
} from "@ethersproject/abstract-provider";
import { Networkish } from "@ethersproject/providers";
import { ethers } from "ethers";
import path from "path";

import { ConnectionInfo, Deferrable, id } from "ethers/lib/utils";
import { RetryProvider } from "./retry-provider";
import { FileStore } from "./store/file-store";
import { RedisStore } from "./store/redis-store";
import { getRedisClient } from "./redis-utils/get-client";

export class ArchiveCacheProvider extends RetryProvider {
  // store: FileStore<string>;
  redisStore: RedisStore<string>;

  constructor(url?: ConnectionInfo | string, network?: Networkish) {
    super(url, network);
    if (typeof network !== "number") {
      throw new Error(
        "Second arg of ArchiveCacheProvider must be a chainId number"
      );
    }
    // this.store = new FileStore(
    //   path.resolve(__dirname, `data/_archive/${network}/`)
    // );
    this.redisStore = new RedisStore({
      client: getRedisClient(),
      updateCache: false,
    });
  }

  async call(
    transaction: Deferrable<TransactionRequest>,
    blockTag?: BlockTag | Promise<BlockTag>
  ): Promise<string> {
    if (typeof blockTag === "number") {
      const key = getKey([
        this.network.name,
        "call",
        String(blockTag),
        (await transaction.to) ?? "no-to",
        id([transaction.to ?? "", transaction.data ?? "", blockTag].join("-")),
      ]);
      return await this.redisStore.getOrSet(
        key,
        async () => {
          return await super.call(transaction, blockTag);
        },
        -1
      );
    } else {
      return await super.call(transaction, blockTag);
    }
  }

  async getBlock(
    blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>
  ): Promise<Block> {
    if (typeof blockHashOrBlockTag === "number") {
      const key = getKey([
        this.network.name,
        "getBlock",
        String(blockHashOrBlockTag),
      ]);
      return await this.redisStore.getOrSet(
        key,
        async () => {
          return await super.getBlock(blockHashOrBlockTag);
        },
        -1
      );
    } else {
      return await super.getBlock(blockHashOrBlockTag);
    }
  }

  async getLogs(
    filter: ethers.providers.Filter
  ): Promise<Array<ethers.providers.Log>> {
    if (
      typeof filter.toBlock === "number" &&
      typeof filter.fromBlock === "number"
    ) {
      const key = getKey([
        this.network.name,
        "getLogs",
        String(filter.fromBlock),
        String(filter.toBlock),
        filter.topics?.join("-") ?? "no-topics",
      ]);
      return await this.redisStore.getOrSet(
        key,
        async () => {
          return await super.getLogs(filter);
        },
        -1
      );
    } else {
      return await super.getLogs(filter);
    }
  }

  async send(method: string, params: any): Promise<any> {
    if (method === "eth_getTransactionReceipt") {
      const key = getKey([this.network.name, "send", method, ...params]);
      return await this.redisStore.getOrSet(
        key,
        async () => {
          return await super.send(method, params);
        },
        -1
      );
    } else {
      return await super.send(method, params);
    }
  }
}

function getKey(items: string[]) {
  return "archive-cache-provider-" + items.join("-");
}
