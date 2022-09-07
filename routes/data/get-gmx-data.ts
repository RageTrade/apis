import { config } from "dotenv";
import { ethers } from "ethers";
import express from "express";

import {
  getContracts,
  NetworkName,
  priceX128ToPrice,
  sqrtPriceX96ToPrice,
} from "@ragetrade/sdk";

import { cacheFunctionResult } from "../../cache";
import { getProvider } from "../../providers";
import {
  getNetworkName,
  getParamAsNumber,
  handleRuntimeErrors,
} from "../../utils";
import { getGmxData } from "../../scripts/protodev-gmx-staking-info-frontend/script";

config();

const router = express.Router();

router.get(
  "/get-gmx-data",
  handleRuntimeErrors(async () => {
    const { result, error } = await cacheFunctionResult(
      getGmxData,
      [],
      60 * 60 // 1 hour
    );
    if (error) throw error;
    if (result) return result;
  })
);

export default router;
