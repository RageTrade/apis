import {
  BlockTag,
  TransactionRequest,
  Block,
  TransactionReceipt,
} from "@ethersproject/abstract-provider";
import { Networkish } from "@ethersproject/providers";
import { stringifyBigNumber } from "@ragetrade/sdk";
import { ethers } from "ethers";
import { ConnectionInfo, Deferrable, id } from "ethers/lib/utils";
import { FileStore } from "./store/file-store";
import { JsonStore } from "./store/json-store";

export class ArchiveCacheProvider extends ethers.providers
  .StaticJsonRpcProvider {
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
