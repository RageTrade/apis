import { ethers } from "ethers";

import {
  ClearingHouse__factory,
  getContracts,
  NetworkName,
} from "@ragetrade/sdk";
import { AccountCreatedEvent } from "@ragetrade/sdk/dist/typechain/core/contracts/interfaces/IClearingHouse";

import { JsonStore } from "../store/json-store";
import { BaseIndexer } from "./base-indexer";

const iface = ClearingHouse__factory.createInterface();

export class AccountCreatedIndexer extends BaseIndexer<number[]> {
  static getStore(networkName: NetworkName): JsonStore<number[]> {
    return new JsonStore<number[]>(`data/${networkName}/accounts-created.json`);
  }

  async getFilter(
    provider: ethers.providers.Provider
  ): Promise<ethers.EventFilter> {
    const { clearingHouse } = await getContracts(provider);
    return clearingHouse.filters.AccountCreated();
  }

  async forEachLog(log: ethers.providers.Log) {
    console.log("for each");
    const parsed = iface.parseLog(log) as unknown as AccountCreatedEvent;
    const accountIds = await this._store.getOrSet(parsed.args.ownerAddress, []);
    accountIds.push(parsed.args.accountId.toNumber());
    await this._store.set(parsed.args.ownerAddress, accountIds);
  }
}
