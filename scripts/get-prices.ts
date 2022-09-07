import {
  NetworkName,
  getContracts,
  sqrtPriceX96ToPrice,
  priceX128ToPrice,
} from "@ragetrade/sdk";
import { ethers } from "ethers";
import { getProvider } from "../providers";

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
