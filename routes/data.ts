import express from "express";

import { cacheFunctionResult } from "../cache";
import { AccountCreatedIndexer } from "../indexer/account-created";
import { getBlockByTimestamp } from "../scripts/get-block-by-timestamp";
import { getPrices } from "../scripts/get-prices";
import { getGmxData } from "../scripts/protodev-gmx-staking-info-frontend/script";
import {
  getNetworkName,
  getParamAsAddress,
  getParamAsInteger,
  getParamAsNumber,
  handleRuntimeErrors,
} from "../utils";

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

router.get(
  "/get-block-by-timestamp",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const timestamp = getParamAsInteger(req, "timestamp");
    return cacheFunctionResult(getBlockByTimestamp, [networkName, timestamp], {
      cacheSeconds: -1,
    });
  })
);

router.get(
  "/get-prices",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const poolId = getParamAsNumber(req, "poolId");
    return cacheFunctionResult(getPrices, [networkName, poolId], {
      cacheSeconds: 15,
    });
  })
);

router.get(
  "/get-gmx-data",
  handleRuntimeErrors(async () => {
    return cacheFunctionResult(getGmxData, [], {
      cacheSeconds: 60 * 60, // 1 hour
    });
  })
);

export default router;
