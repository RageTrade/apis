import express from "express";

import { cacheFunctionResult } from "../../cache";
import * as aggregated from "../../scripts/aggregated";
import { getNetworkName, handleRuntimeErrors, hours, mins } from "../../utils";
import UserRouter from "./user";

const router = express.Router();

router.get(
  "/get-aave-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getAavePnl, [networkName], {
      cacheSeconds: 20 * mins,
    });
  })
);

router.get(
  "/get-glp-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpPnl, [networkName], {
      cacheSeconds: 20 * mins,
    });
  })
);

router.get(
  "/get-glp-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpSlippage, [networkName], {
      cacheSeconds: 20 * mins,
    });
  })
);

router.get(
  "/get-glp-rewards",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpRewards, [networkName], {
      cacheSeconds: 20 * mins,
    });
  })
);

router.get(
  "/get-total-shares",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getTotalShares, [networkName], {
      cacheSeconds: 20 * mins,
    });
  })
);

router.get(
  "/get-uniswap-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getUniswapSlippage, [networkName], {
      cacheSeconds: 20 * mins,
    });
  })
);

router.get(
  "/get-aave-lends",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(
      aggregated.vaultMetrics.getAaveLends,
      [networkName],
      { cacheSeconds: 20 * mins }
    );
  })
);

router.get(
  "/get-aave-borrows",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(
      aggregated.vaultMetrics.getAaveBorrows,
      [networkName],
      { cacheSeconds: 20 * mins }
    );
  })
);

router.get(
  "/get-trader-pnl",
  handleRuntimeErrors(async () => {
    return cacheFunctionResult(aggregated.vaultMetrics.getTraderPnl, [], {
      cacheSeconds: 20 * mins,
    });
  })
);

router.use("/user", UserRouter);

export default router;
