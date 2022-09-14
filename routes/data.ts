import express from "express";

import { cacheFunctionResult } from "../cache";
import { getAccountIdsByAddress } from "../scripts/get-account-ids-by-address";
import { getAvgVaultMarketValue } from "../scripts/get-avg-vault-market-value";
import { getBlockByTimestamp } from "../scripts/get-block-by-timestamp";
import { getGmxVaultInfo } from "../scripts/get-gmx-vault-info";
import { getGmxVaultInfoByTokenAddress } from "../scripts/get-gmx-vault-info-by-token-address";
import { getPoolInfo } from "../scripts/get-pool-info";
import { getPrices } from "../scripts/get-prices";
import { getVaultApyInfo } from "../scripts/get-vault-apy-info";
import { getVaultInfo } from "../scripts/get-vault-info";
import { getGmxData } from "../scripts/protodev-gmx-staking-info-frontend/script";
import {
  getNetworkName,
  getParamAsAddress,
  getParamAsInteger,
  getParamAsNumber,
  getVaultName,
  handleRuntimeErrors,
} from "../utils";

const router = express.Router();

router.get(
  "/get-account-ids-by-address",
  handleRuntimeErrors(async function (req, res) {
    const networkName = getNetworkName(req);
    const userAddress = getParamAsAddress(req, "userAddress");
    return cacheFunctionResult(
      getAccountIdsByAddress,
      [networkName, userAddress],
      { cacheSeconds: 5 }
    );
  })
);

router.get(
  "/get-block-by-timestamp",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const timestamp = getParamAsInteger(req, "timestamp");
    return cacheFunctionResult(getBlockByTimestamp, [networkName, timestamp]);
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
  "/get-pool-info",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const poolId = getParamAsNumber(req, "poolId");
    return cacheFunctionResult(getPoolInfo, [networkName, poolId], {
      cacheSeconds: 15,
    });
  })
);

// gives arbmain staking data
router.get(
  "/get-gmx-data",
  handleRuntimeErrors(async () => {
    return cacheFunctionResult(getGmxData, [], {
      cacheSeconds: 60 * 60, // 1 hour
    });
  })
);

router.get(
  "/get-avg-vault-market-value",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(getAvgVaultMarketValue, [networkName], {
      cacheSeconds: 60 * 60, // 1 hour
    });
  })
);

router.get(
  "/get-vault-apy-info",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(getVaultApyInfo, [networkName], {
      cacheSeconds: 60 * 60, // 1 hour
    });
  })
);

router.get(
  "/get-vault-info",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const vaultName = getVaultName(req);
    return cacheFunctionResult(getVaultInfo, [networkName, vaultName], {
      cacheSeconds: 5 * 60, // 5 mins
    });
  })
);

router.get(
  "/get-gmx-vault-info-by-token-address",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const tokenAddress = getParamAsAddress(req, "tokenAddress");
    return cacheFunctionResult(
      getGmxVaultInfoByTokenAddress,
      [networkName, tokenAddress],
      {
        cacheSeconds: 60, // 1 mins
      }
    );
  })
);

router.get(
  "/get-gmx-vault-info",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    return cacheFunctionResult(getGmxVaultInfo, [networkName], {
      cacheSeconds: 10 * 60, // 10 mins
    });
  })
);

export default router;
