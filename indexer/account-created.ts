import { ethers } from "ethers";

import { ClearingHouse__factory, core, NetworkName } from "@ragetrade/sdk";
import { AccountCreatedEvent } from "@ragetrade/sdk/dist/typechain/core/contracts/interfaces/IClearingHouse";

import { FileStore } from "../store/file-store";
import { BaseIndexer } from "./base-indexer";

const iface = ClearingHouse__factory.createInterface();

export class AccountCreatedIndexer extends BaseIndexer<number[]> {
  getStore(): FileStore<number[]> {
    return new FileStore<number[]>(
      `data/${this._networkName}/accounts-created`
    );
  }

  async getFilter(
    provider: ethers.providers.Provider
  ): Promise<ethers.EventFilter> {
    const { clearingHouse } = await core.getContracts(provider);
    return clearingHouse.filters.AccountCreated();
  }

  async forEachLog(log: ethers.providers.Log) {
    console.log("for each");
    const parsed = iface.parseLog(log) as unknown as AccountCreatedEvent;
    const store = this.getCachedStoreObject();
    const accountIds = await store.getOrSet<number[]>(
      parsed.args.ownerAddress,
      () => []
    );
    accountIds.push(parsed.args.accountId.toNumber());
    await store.set(parsed.args.ownerAddress, accountIds);
  }
}
