import { NetworkName } from "@ragetrade/sdk";

import { AccountCreatedIndexer } from "../indexer/account-created";

export async function getAccountIdsByAddress(
  networkName: NetworkName,
  userAddress: string
) {
  const store = new AccountCreatedIndexer(networkName).getStore();
  const accountIds = await store.get(userAddress);
  return {
    result: accountIds ?? [],
    syncedBlock: Number(await store.get("synced-block")),
  };
}
