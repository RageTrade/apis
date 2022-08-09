import express from "express";

import { AccountCreatedIndexer } from "../../indexer/account-created";
import {
  parseAddress,
  parseNetworkName,
  handleRuntimeErrors,
} from "../../utils";

const router = express.Router();

router.get(
  "/get-account-ids-by-address",
  handleRuntimeErrors(async function (req, res) {
    const networkName = parseNetworkName(req.query.networkName);
    const address = parseAddress(req.query.address, "address");

    const store = AccountCreatedIndexer.getStore(networkName);
    const accountIds = await store.get(address);
    return accountIds ?? [];
  })
);

export default router;
