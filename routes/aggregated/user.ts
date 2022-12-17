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
      aggregated.user.getUserAavePnl,
      [networkName, userAddress],
      { cacheSeconds: 3 * mins }
    );
  })
);

router.get(
  "/get-glp-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    return cacheFunctionResult(
      aggregated.user.getUserGlpPnl,
      [networkName, userAddress],
      { cacheSeconds: 3 * mins }
    );
  })
);

router.get(
  "/get-glp-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    return cacheFunctionResult(
      aggregated.user.getUserGlpSlippage,
      [networkName, userAddress],
      { cacheSeconds: 3 * mins }
    );
  })
);

router.get(
  "/get-glp-rewards",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    return cacheFunctionResult(
      aggregated.user.getUserGlpRewards,
      [networkName, userAddress],
      { cacheSeconds: 3 * mins }
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
      { cacheSeconds: 3 * hours } // this is very slow, so cache for a long time
    );
  })
);

router.get(
  "/get-uniswap-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    return cacheFunctionResult(
      aggregated.user.getUserUniswapSlippage,
      [networkName, userAddress],
      { cacheSeconds: 3 * mins }
    );
  })
);

export default router;
