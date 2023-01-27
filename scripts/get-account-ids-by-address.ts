import {
  NetworkName,
  getAccountIdsByAddress as getAccountIdsByAddressSDK,
} from "@ragetrade/sdk";

import { AccountCreatedIndexer } from "../indexer/account-created";

export async function getAccountIdsByAddress(
  networkName: NetworkName,
  userAddress: string
) {
  const accountsCreatedIndexer = new AccountCreatedIndexer(networkName);
  const accountIds = (await accountsCreatedIndexer.get(userAddress)) ?? [];
  const syncedBlock = await accountsCreatedIndexer.get("synced-block");

  if (accountIds.length === 0) {
    try {
      return {
        result: await getAccountIdsByAddressSDK(userAddress, networkName),
        syncedBlock: "latest",
      };
    } catch {}
  }

  return {
    result: Array.from(new Set(accountIds).values()),
    syncedBlock,
  };
}
