import express from "express";

import { cacheFunctionResult } from "../../cache";
import * as aggregated from "../../scripts/aggregated";
import { getNetworkName, handleRuntimeErrors, hours } from "../../utils";
import UserRouter from "./user";

const router = express.Router();

router.get(
  "/get-aave-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getAavePnl, [networkName], {
      cacheSeconds: 3 * hours,
    });
  })
);

router.get(
  "/get-glp-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpPnl, [networkName], {
      cacheSeconds: 3 * hours,
    });
  })
);

router.get(
  "/get-glp-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpSlippage, [networkName], {
      cacheSeconds: 3 * hours,
    });
  })
);

router.get(
  "/get-glp-rewards",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpRewards, [networkName], {
      cacheSeconds: 3 * hours,
    });
  })
);

router.get(
  "/get-total-shares",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getTotalShares, [networkName], {
      cacheSeconds: 3 * hours,
    });
  })
);

router.get(
  "/get-uniswap-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getUniswapSlippage, [networkName], {
      cacheSeconds: 3 * hours,
    });
  })
);

router.use("/user", UserRouter);

export default router;
