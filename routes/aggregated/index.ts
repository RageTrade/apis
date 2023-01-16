import express from "express";

import { cacheFunctionResult } from "../../cache";
import * as aggregated from "../../scripts/aggregated";
import {
  getNetworkName,
  handleRuntimeErrors,
  hours,
  mins,
  secs,
} from "../../utils";
import UserRouter from "./user";

const router = express.Router();

router.get(
  "/get-aave-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getAavePnl, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-glp-pnl",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpPnl, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-glp-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpSlippage, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-glp-rewards",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getGlpRewards, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-total-shares",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getTotalShares, [networkName], {
      cacheSeconds: 9 * hours,
    });
  })
);

router.get(
  "/get-uniswap-slippage",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getUniswapSlippage, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-delta-spread",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getDeltaSpread, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-aave-lends",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getAaveLends, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-aave-borrows",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getAaveBorrows, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-trader-pnl",
  handleRuntimeErrors(async () => {
    return cacheFunctionResult(aggregated.getTraderPnl, [], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-vault-info",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getVaultInfo, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/per-interval",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.perInterval, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/per-interval-2",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.perInterval, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.get(
  "/get-market-movement",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(aggregated.getMarketMovement, [networkName], {
      cacheSeconds: 6 * hours,
    });
  })
);

router.use("/user", UserRouter);

export default router;
