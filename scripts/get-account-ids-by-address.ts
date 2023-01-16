import {
  NetworkName,
  getAccountIdsByAddress as getAccountIdsByAddressSDK,
} from "@ragetrade/sdk";

import { AccountCreatedIndexer } from "../indexer/account-created";

export async function getAccountIdsByAddress(
  networkName: NetworkName,
  userAddress: string
) {
  try {
    return {
      result: await getAccountIdsByAddressSDK(userAddress, networkName),
      syncedBlock: "latest",
    };
  } catch {}

  const store = new AccountCreatedIndexer(networkName).getStore();
  const accountIds = await store.get(userAddress);
  return {
    result: accountIds ?? [],
    syncedBlock: Number(await store.get("synced-block")),
  };
}
