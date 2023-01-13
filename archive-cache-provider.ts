import {
  BlockTag,
  TransactionRequest,
  Block,
} from "@ethersproject/abstract-provider";
import { Networkish } from "@ethersproject/providers";
import { ethers } from "ethers";

import { ConnectionInfo, Deferrable, id } from "ethers/lib/utils";
import { RetryProvider } from "./retry-provider";
import { FileStore } from "./store/file-store";

export class ArchiveCacheProvider extends RetryProvider {
  store: FileStore<string>;

  constructor(url?: ConnectionInfo | string, network?: Networkish) {
    super(url, network);
    if (typeof network !== "number") {
      throw new Error(
        "Second arg of ArchiveCacheProvider must be a chainId number"
      );
    }
    this.store = new FileStore(`data/_archive/${network}/`);
  }

  async call(
    transaction: Deferrable<TransactionRequest>,
    blockTag?: BlockTag | Promise<BlockTag>
  ): Promise<string> {
    if (typeof blockTag === "number") {
      const requestId = id(
        [transaction.to ?? "", transaction.data ?? "", blockTag].join("-")
      );
      return await this.store.getOrSet(requestId, async () => {
        return await super.call(transaction, blockTag);
      });
    } else {
      return await super.call(transaction, blockTag);
    }
  }

  async getBlock(
    blockHashOrBlockTag: BlockTag | string | Promise<BlockTag | string>
  ): Promise<Block> {
    if (typeof blockHashOrBlockTag === "number") {
      const requestId = id(["getBlock", blockHashOrBlockTag].join("-"));
      return await this.store.getOrSet(requestId, async () => {
        return await super.getBlock(blockHashOrBlockTag);
      });
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
      const requestId =
        "getLogs" + id(["getLogs", filter.fromBlock, filter.toBlock].join("-"));
      return await this.store.getOrSet(requestId, async () => {
        return await super.getLogs(filter);
      });
    } else {
      return await super.getLogs(filter);
    }
  }

  async send(method: string, params: any): Promise<any> {
    if (method === "eth_getTransactionReceipt") {
      const requestId = id(["send", method, ...params].join("-"));
      return await this.store.getOrSet(requestId, async () => {
        return await super.send(method, params);
      });
    } else {
      return await super.send(method, params);
    }
  }
}
