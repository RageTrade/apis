import express from "express";

import { AccountCreatedIndexer } from "../../indexer/account-created";
import { parseAddress, parseNetworkName } from "../../utils";

const router = express.Router();

router.get("/get-account-ids-by-address", async function (req, res, next) {
  const address = parseAddress(req.query.address, "address");
  const networkName = parseNetworkName(req.query.networkName);

  const store = AccountCreatedIndexer.getStore(networkName);
  const result = (await store.get(address)) ?? [];
  res.json({ result });
});

export default router;
