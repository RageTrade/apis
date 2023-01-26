import express from "express";
import {
  getExcludeRawData,
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
  "/get-aave-borrows",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserAaveBorrows,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-aave-lends",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserAaveLends,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-aave-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserAavePnl,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-delta-spread",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserDeltaSpread,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-glp-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserGlpPnl,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-glp-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserGlpSlippage,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-glp-rewards",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserGlpRewards,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-shares",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserShares,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 24 * hours } // this is very slow, so cache for a long time
    );
  })
);

router.get(
  "/get-trader-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserTraderPnl,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-uniswap-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserUniswapSlippage,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

router.get(
  "/get-market-movement",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    const excludeRawData = getExcludeRawData(req);
    return cacheFunctionResult(
      aggregated.user.getUserMarketMovement,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours }
    );
  })
);

export default router;
