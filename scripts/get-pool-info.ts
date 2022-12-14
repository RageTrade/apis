import {
  NetworkName,
  sqrtPriceX96ToPrice,
  priceX128ToPrice,
  IUniswapV3Pool__factory,
  IOracle__factory,
  VPoolWrapper__factory,
  formatFundingRate,
  core,
  sqrtPriceX96ToPriceX128,
  priceX128ToSqrtPriceX96,
  getNetworkNameFromProvider,
} from "@ragetrade/sdk";
import { BigNumber, BigNumberish, ethers } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { getProvider } from "../providers";
import { currentTimestamp } from "../utils";
import { getBlockByTimestamp } from "./get-block-by-timestamp";

export async function getPoolInfo(
  networkName: NetworkName,
  poolId: BigNumberish
) {
  const provider = getProvider(networkName);
  return await _getPoolInfo(provider, poolId);
}

export async function _getPoolInfo(
  provider: ethers.providers.Provider,
  poolId: BigNumberish
) {
  const networkName = await getNetworkNameFromProvider(provider);
  poolId = BigNumber.from(poolId);
  const { clearingHouse, clearingHouseLens } = await core.getContracts(
    provider
  );

  const [realTwapPriceX128, virtualTwapPriceX128, pool] = await Promise.all([
    clearingHouse.getRealTwapPriceX128(poolId),
    clearingHouse.getVirtualTwapPriceX128(poolId),
    clearingHouseLens.getPoolInfo(poolId),
  ]);

  if (pool.vPool === ethers.constants.AddressZero) {
    throw new Error(`Pool with id ${poolId} not found`);
  }

  const vPool = IUniswapV3Pool__factory.connect(pool.vPool, provider);
  const vPoolWrapper = VPoolWrapper__factory.connect(
    pool.vPoolWrapper,
    provider
  );
  const oracle = IOracle__factory.connect(pool.settings.oracle, provider);

  const slot0 = await vPool.slot0();
  const slot0_24H = await vPool.slot0({
    blockTag: getBlockByTimestamp(
      networkName,
      currentTimestamp() - 24 * 60 * 60
    ),
  });
  const realPriceX128 = await oracle.getTwapPriceX128(0);

  const realPrice = await priceX128ToPrice(realPriceX128, 6, 18);
  const virtualPrice = await sqrtPriceX96ToPrice(slot0.sqrtPriceX96, 6, 18);
  const virtualPrice_old24H = await sqrtPriceX96ToPrice(
    slot0_24H.sqrtPriceX96,
    6,
    18
  );
  const realTwapPrice = await priceX128ToPrice(realTwapPriceX128, 6, 18);
  const virtualTwapPrice = await priceX128ToPrice(virtualTwapPriceX128, 6, 18);

  const { fundingRateX128 } =
    await vPoolWrapper.getFundingRateAndVirtualPrice();
  const sumAX128 = await vPoolWrapper.getExtrapolatedSumAX128();

  return {
    // js number
    realPrice,
    virtualPrice,
    virtualPrice_old24H,
    realTwapPrice,
    virtualTwapPrice,
    fundingRate: formatFundingRate(fundingRateX128),

    // fixed point
    realSqrtPriceX96: priceX128ToSqrtPriceX96(realPriceX128).toString(),
    virtualSqrtPriceX96: slot0.sqrtPriceX96.toString(),
    realPriceX128: realPriceX128.toString(),
    virtualPriceX128: sqrtPriceX96ToPriceX128(slot0.sqrtPriceX96).toString(),
    virtualPriceX128_old24H: sqrtPriceX96ToPriceX128(
      slot0_24H.sqrtPriceX96
    ).toString(),
    realTwapPriceX128: realTwapPriceX128.toString(),
    virtualTwapPriceX128: virtualTwapPriceX128.toString(),
    fundingRateX128: fundingRateX128.toString(),
    sumAX128: sumAX128.toString(),

    // decimal
    realPriceD18: parseUnits(realPrice.toFixed(18), 18).toString(),
    virtualPriceD18: parseUnits(virtualPrice.toFixed(18), 18).toString(),
    virtualPriceD18_old24H: parseUnits(
      virtualPrice_old24H.toFixed(18),
      18
    ).toString(),
    realTwapPriceD18: parseUnits(realTwapPrice.toFixed(18), 18).toString(),
    virtualTwapPriceD18: parseUnits(
      virtualTwapPrice.toFixed(18),
      18
    ).toString(),
    fundingRateD18: parseUnits(
      formatFundingRate(fundingRateX128).toFixed(18),
      18
    ).toString(),
  };
}
