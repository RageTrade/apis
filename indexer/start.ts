import { AccountCreatedIndexer } from "./account-created";

new AccountCreatedIndexer("arbmain", 17185390, 5000).start();
// new AccountCreatedIndexer("arbtest", 12705265, 5000).start();
// new AccountCreatedIndexer("arbrinkeby", 12705265, 5000).start();
new AccountCreatedIndexer("arbgoerli", 408336, 5000).start();
