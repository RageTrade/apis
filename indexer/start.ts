import { AccountCreatedIndexer } from "./account-created";
import { arbtest } from "../providers";
import { JsonStore } from "../store/json-store";

startAccountCreatedTestnet().catch(console.error);

async function startAccountCreatedTestnet() {
  const store = new JsonStore<number[]>("data/testnet/account-created.json");
  const indexer = new AccountCreatedIndexer(12705265, 50000, store, arbtest);
  while (1) {
    try {
      await indexer.resume();
    } catch (e) {
      console.error(e);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
