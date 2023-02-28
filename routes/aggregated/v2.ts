import express from 'express'
import { cacheFunctionResult } from '../../cache'
import {
  getExcludeRawData,
  getNetworkName,
  getParamAsAddress,
  handleRuntimeErrors,
  hours
} from '../../utils'
import * as aggregated from '../../scripts/aggregated'

const router = express.Router()

router.get(
  '/get-rebalance-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(aggregated.v2.getRebalanceInfo, [networkName], {
      cacheSeconds: 30 * hours,
      tags: ['aggregated', 'v2']
    })
  })
)

export default router
