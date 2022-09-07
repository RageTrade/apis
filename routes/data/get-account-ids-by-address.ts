import express from "express";

import { AccountCreatedIndexer } from "../../indexer/account-created";
import {
  getNetworkName,
  getParamAsAddress,
  handleRuntimeErrors,
} from "../../utils";

const router = express.Router();

router.get(
  "/get-account-ids-by-address",
  handleRuntimeErrors(async function (req, res) {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");

    const store = AccountCreatedIndexer.getStore(networkName);
    const accountIds = await store.get(userAddress);
    return accountIds ?? [];
  })
);

export default router;
