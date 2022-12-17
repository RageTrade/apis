import express from "express";
import {
  getNetworkName,
  getParamAsAddress,
  handleRuntimeErrors,
  hours,
  mins,
  secs,
} from "../../utils";
import * as aggregated from "../../scripts/aggregated";
import { cacheFunctionResult } from "../../cache";

const router = express.Router();

router.get(
  "/get-aave-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    return cacheFunctionResult(
      aggregated.user.getAavePnl,
      [networkName, userAddress],
      {
        cacheSeconds: 3 * mins,
      }
    );
  })
);

router.get(
  "/get-shares",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    return cacheFunctionResult(
      aggregated.user.getUserShares,
      [networkName, userAddress],
      { cacheSeconds: 3 * mins }
    );
  })
);

export default router;
