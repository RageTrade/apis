import {
  NetworkName,
  getContracts,
  sqrtPriceX96ToPrice,
  priceX128ToPrice,
  IUniswapV3Pool__factory,
  IOracle__factory,
} from "@ragetrade/sdk";
import { ethers } from "ethers";
import { getProvider } from "../providers";

export async function getPrices(networkName: NetworkName, poolId: number) {
  const provider = getProvider(networkName);
  const { clearingHouse, clearingHouseLens } = await getContracts(provider);

  const [realTwapPriceX128, virtualTwapPriceX128, pool] = await Promise.all([
    clearingHouse.getRealTwapPriceX128(poolId),
    clearingHouse.getVirtualTwapPriceX128(poolId),
    clearingHouseLens.getPoolInfo(poolId),
  ]);

  if (pool.vPool === ethers.constants.AddressZero) {
    throw new Error(`Pool with id ${poolId} not found`);
  }

  const vPool = IUniswapV3Pool__factory.connect(pool.vPool, provider);
  const oracle = IOracle__factory.connect(pool.settings.oracle, provider);
  const { sqrtPriceX96 } = await vPool.slot0();
  const realPriceX128 = await oracle.getTwapPriceX128(0);

  return {
    realPrice: await priceX128ToPrice(realPriceX128, 6, 18),
    virtualPrice: await sqrtPriceX96ToPrice(sqrtPriceX96, 6, 18),
    realTwapPrice: await priceX128ToPrice(realTwapPriceX128, 6, 18),
    virtualTwapPrice: await priceX128ToPrice(virtualTwapPriceX128, 6, 18),
  };
}
