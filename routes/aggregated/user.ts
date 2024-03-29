import express from 'express'

import { cacheFunctionResult } from '../../cache'
import * as aggregated from '../../scripts/aggregated'
import {
  getExcludeRawData,
  getNetworkName,
  getParamAsAddress,
  handleRuntimeErrors,
  hours
} from '../../utils'

const router = express.Router()

router.get(
  '/get-aave-borrows',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserAaveBorrows,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-aave-lends',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserAaveLends,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-aave-pnl',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserAavePnl,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-delta-spread',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserDeltaSpread,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-glp-pnl',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserGlpPnl,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-glp-slippage',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserGlpSlippage,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-glp-rewards',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserGlpRewards,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-shares',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserShares,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-trader-pnl',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserTraderPnl,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-uniswap-slippage',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserUniswapSlippage,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

router.get(
  '/get-market-movement',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    const excludeRawData = getExcludeRawData(req)
    return cacheFunctionResult(
      aggregated.user.getUserMarketMovement,
      [networkName, userAddress, excludeRawData],
      { cacheSeconds: 6 * hours, tags: ['aggregated'] }
    )
  })
)

export default router
