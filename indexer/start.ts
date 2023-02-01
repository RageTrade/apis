import { config } from 'dotenv'
config()

import { AccountCreatedIndexer } from './account-created'

new AccountCreatedIndexer('arbmain').start(17185390)
new AccountCreatedIndexer('arbgoerli').start(408336)

// dn vault events

// import { deltaNeutralGmxVaults, tokens } from "@ragetrade/sdk";
// import { SimpleEventCache } from "./simple-event-cache";

// const { DnGmxJuniorVaultDeployment } =
//   deltaNeutralGmxVaults.getDeployments("arbmain");
// const { dnGmxJuniorVault, dnGmxBatchingManager } =
//   deltaNeutralGmxVaults.getContractsSync("arbmain");
// const { weth } = tokens.getContractsSync("arbmain");

// new SimpleEventCache("arbmain", dnGmxJuniorVault.filters.Deposit()).start(
//   DnGmxJuniorVaultDeployment.receipt?.blockNumber ?? 0,
//   10000
// );
// new SimpleEventCache("arbmain", dnGmxJuniorVault.filters.Withdraw()).start(
//   DnGmxJuniorVaultDeployment.receipt?.blockNumber ?? 0,
//   10000
// );
// new SimpleEventCache("arbmain", dnGmxJuniorVault.filters.Rebalanced()).start(
//   DnGmxJuniorVaultDeployment.receipt?.blockNumber ?? 0,
//   10000
// );
// new SimpleEventCache(
//   "arbmain",
//   dnGmxBatchingManager.filters.DepositToken(null, weth.address)
// ).start(DnGmxJuniorVaultDeployment.receipt?.blockNumber ?? 0, 10000);
// new SimpleEventCache("arbmain", dnGmxJuniorVault.filters.GlpSwapped()).start(
//   DnGmxJuniorVaultDeployment.receipt?.blockNumber ?? 0,
//   10000
// );
// new SimpleEventCache(
//   "arbmain",
//   dnGmxJuniorVault.filters.RewardsHarvested()
// ).start(DnGmxJuniorVaultDeployment.receipt?.blockNumber ?? 0, 10000);
