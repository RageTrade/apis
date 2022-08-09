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
    const address = parseAddress(req.query.address, "address");
    const networkName = parseNetworkName(req.query.networkName);

    const store = AccountCreatedIndexer.getStore(networkName);
    const result = (await store.get(address)) ?? [];
    res.json({ result });
  })
);

export default router;
