import express from 'express'

import { cacheFunctionResult } from '../../cache'
import * as aggregated from '../../scripts/aggregated'
import {
  pagination,
  getExcludeRawData,
  getNetworkName,
  handleRuntimeErrors,
  hours
} from '../../utils'
import UserRouter from './user'
import V2Router from './v2'

const router = express.Router()

router.get(
  '/get-aave-pnl',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getAavePnl, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-glp-pnl',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getGlpPnl, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-glp-slippage',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getGlpSlippage, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-glp-rewards',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getGlpRewards, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-total-shares',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getTotalShares, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-uniswap-slippage',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getUniswapSlippage, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-delta-spread',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getDeltaSpread, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-aave-lends',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getAaveLends, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-aave-borrows',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getAaveBorrows, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-trader-pnl',
  handleRuntimeErrors(async (req) => {
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getTraderPnl, [excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-vault-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getVaultInfo, [networkName], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-market-movement',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const excludeRawData = getExcludeRawData(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getMarketMovement, [networkName, excludeRawData], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.get(
  '/get-rebalance-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return pagination(
      req,
      cacheFunctionResult(aggregated.getRebalanceInfo, [networkName], {
        cacheSeconds: 30 * hours,
        tags: ['aggregated']
      })
    )
  })
)

router.use('/user', UserRouter)
router.use('/v2', V2Router)

export default router
