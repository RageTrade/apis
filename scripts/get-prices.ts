import type { NetworkName } from '@ragetrade/sdk'
import {
  core,
  IOracle__factory,
  IUniswapV3Pool__factory,
  priceX128ToPrice,
  sqrtPriceX96ToPrice,
  VaultName
} from '@ragetrade/sdk'
import type { BigNumberish } from 'ethers'
import { BigNumber, ethers } from 'ethers'
import { parseUnits } from 'ethers/lib/utils'

import { getProvider } from '../providers'

export async function getPrices(networkName: NetworkName, poolId: BigNumberish) {
  const provider = getProvider(networkName)
  return await _getPrices(provider, poolId)
}

export async function _getPrices(
  provider: ethers.providers.Provider,
  poolId: BigNumberish
) {
  poolId = BigNumber.from(poolId)
  const { clearingHouse, clearingHouseLens } = await core.getContracts(provider)

  const [realTwapPriceX128, virtualTwapPriceX128, pool] = await Promise.all([
    clearingHouse.getRealTwapPriceX128(poolId),
    clearingHouse.getVirtualTwapPriceX128(poolId),
    clearingHouseLens.getPoolInfo(poolId)
  ])

  if (pool.vPool === ethers.constants.AddressZero) {
    throw new Error(`Pool with id ${poolId} not found`)
  }

  const vPool = IUniswapV3Pool__factory.connect(pool.vPool, provider)
  const oracle = IOracle__factory.connect(pool.settings.oracle, provider)
  const { sqrtPriceX96 } = await vPool.slot0()
  const realPriceX128 = await oracle.getTwapPriceX128(0)

  const realPrice = await priceX128ToPrice(realPriceX128, 6, 18)
  const virtualPrice = await sqrtPriceX96ToPrice(sqrtPriceX96, 6, 18)
  const realTwapPrice = await priceX128ToPrice(realTwapPriceX128, 6, 18)
  const virtualTwapPrice = await priceX128ToPrice(virtualTwapPriceX128, 6, 18)

  return {
    realPrice,
    virtualPrice,
    realTwapPrice,
    virtualTwapPrice,

    realPriceD18: parseUnits(realPrice.toFixed(18), 18).toString(),
    virtualPriceD18: parseUnits(virtualPrice.toFixed(18), 18).toString(),
    realTwapPriceD18: parseUnits(realTwapPrice.toFixed(18), 18).toString(),
    virtualTwapPriceD18: parseUnits(virtualTwapPrice.toFixed(18), 18).toString()
  }
}
