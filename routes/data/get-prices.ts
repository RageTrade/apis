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

config();

const router = express.Router();

router.get(
  "/get-prices",
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req);
    const poolId = getParamAsNumber(req, "poolId");
    const { result, error } = await cacheFunctionResult(
      getPrices,
      [networkName, poolId],
      6
    );
    if (error) throw error;
    if (result) return result;
  })
);

export default router;

export async function getPrices(networkName: NetworkName, poolId: number) {
  const provider = getProvider(networkName);
  const { clearingHouse, clearingHouseLens, eth_vPool } = await getContracts(
    provider
  );

  const [realTwapPriceX128, virtualTwapPriceX128, pool] = await Promise.all([
    clearingHouse.getRealTwapPriceX128(poolId),
    clearingHouse.getVirtualTwapPriceX128(poolId),
    clearingHouseLens.getPoolInfo(poolId),
  ]);

  const vPool = pool.vPool;
  if (vPool === ethers.constants.AddressZero) {
    throw new Error(`Pool with id ${poolId} not found`);
  }
  const { sqrtPriceX96 } = await eth_vPool.connect(vPool).slot0();

  return {
    virtualPrice: await sqrtPriceX96ToPrice(sqrtPriceX96, 6, 18),
    realTwapPrice: await priceX128ToPrice(realTwapPriceX128, 6, 18),
    virtualTwapPrice: await priceX128ToPrice(virtualTwapPriceX128, 6, 18),
  };
}
