import express from 'express'
import { readJson } from 'fs-extra'

import { date } from '../analytics'
import { cacheFunctionResult } from '../cache'
import { getAccountIdsByAddress } from '../scripts/get-account-ids-by-address'
import { getAvgVaultMarketValue } from '../scripts/get-avg-vault-market-value'
import { getBlockByTimestamp } from '../scripts/get-block-by-timestamp'
import { getGmxVaultInfo } from '../scripts/get-gmx-vault-info'
import { getGmxVaultInfoByTokenAddress } from '../scripts/get-gmx-vault-info-by-token-address'
import { getPoolInfo } from '../scripts/get-pool-info'
import { getPrices } from '../scripts/get-prices'
import { getVaultApyInfo } from '../scripts/get-vault-apy-info'
import { getVaultInfo } from '../scripts/get-vault-info'
import { getGmxData } from '../scripts/protodev-gmx-staking-info-frontend/script'
import * as v2 from '../scripts/v2'
import {
  getNetworkName,
  getParamAsAddress,
  getParamAsInteger,
  getParamAsNumber,
  getVaultName,
  handleRuntimeErrors,
  hours,
  mins,
  secs
} from '../utils'
import AggregatedRouter from './aggregated'

const router = express.Router()

/**
 * General
 */

router.get(
  '/analytics',
  handleRuntimeErrors(async () => {
    return cacheFunctionResult(
      async () => {
        return readJson(`data/_analytics/${date()}.json`)
      },
      [],
      { cacheSeconds: 1 * secs }
    )
  })
)

// temporary, remove this later
// router.get(
//   "/flushall",
//   handleRuntimeErrors(async (req, res) => {
//     const password = getParamAsString(req, "password");

//     if (
//       id(password) ===
//       "0x5425ff8c8a1a13b6db65f72158f4dd0e1d8aefacc5ab79299ed93c659688200b"
//     ) {
//       await flushall();
//       return { result: "OK" };
//     } else {
//       throw new ErrorWithStatusCode("NOT OK", 400);
//     }
//   })
// );

/**
 * Aggregated
 */

router.use('/aggregated', AggregatedRouter)

/**
 * Network independent
 */

router.get(
  '/get-gmx-data',
  handleRuntimeErrors(async () => {
    return cacheFunctionResult(getGmxData, [], {
      cacheSeconds: 1 * hours
    })
  })
)

/**
 * Not dependent on provider queries
 */

router.get(
  '/get-account-ids-by-address',
  handleRuntimeErrors(async function (req, res) {
    const networkName = getNetworkName(req)
    const userAddress = getParamAsAddress(req, 'userAddress')
    return cacheFunctionResult(getAccountIdsByAddress, [networkName, userAddress], {
      cacheSeconds: 1 * secs
    })
  })
)

router.get(
  '/get-block-by-timestamp',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const timestamp = getParamAsInteger(req, 'timestamp')
    return cacheFunctionResult(getBlockByTimestamp, [networkName, timestamp], {
      cacheSeconds: 1 * hours
    })
  })
)

/**
 * To be removed
 */

router.get(
  '/get-avg-vault-market-value',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(getAvgVaultMarketValue, [networkName], {
      cacheSeconds: 1 * hours
    })
  })
)

/**
 * Not on DataSource
 */

router.get(
  '/get-vault-apy-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(getVaultApyInfo, [networkName], {
      cacheSeconds: 1 * hours
    })
  })
)

/**
 * DataSource APIs
 */

router.get(
  '/get-prices',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const poolId = getParamAsNumber(req, 'poolId')
    return cacheFunctionResult(getPrices, [networkName, poolId], {
      cacheSeconds: 15 * secs
    })
  })
)
router.get(
  '/v2/get-prices',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const poolId = getParamAsNumber(req, 'poolId')
    return cacheFunctionResult(v2.getPrices, [networkName, poolId], {
      cacheSeconds: 15 * secs,
      tags: ['v2']
    })
  })
)

router.get(
  '/get-pool-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const poolId = getParamAsNumber(req, 'poolId')
    return cacheFunctionResult(getPoolInfo, [networkName, poolId], {
      cacheSeconds: 15 * secs
    })
  })
)
router.get(
  '/v2/get-pool-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const poolId = getParamAsNumber(req, 'poolId')
    return cacheFunctionResult(v2.getPoolInfo, [networkName, poolId], {
      cacheSeconds: 15 * secs,
      tags: ['v2']
    })
  })
)

router.get(
  '/get-vault-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const vaultName = getVaultName(req)
    return cacheFunctionResult(getVaultInfo, [networkName, vaultName], {
      cacheSeconds: 5 * mins
    })
  })
)
router.get(
  '/v2/get-vault-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const vaultName = getVaultName(req)
    return cacheFunctionResult(v2.getVaultInfo, [networkName, vaultName], {
      cacheSeconds: 10 * mins,
      tags: ['v2']
    })
  })
)
router.get(
  '/v2/get-vault-info-fast',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const vaultName = getVaultName(req)
    return cacheFunctionResult(v2.getVaultInfoFast, [networkName, vaultName], {
      cacheSeconds: 15 * secs,
      tags: ['v2']
    })
  })
)

router.get(
  '/v2/get-vault-market-value',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const vaultName = getVaultName(req)
    return cacheFunctionResult(v2.getVaultMarketValue, [networkName, vaultName], {
      cacheSeconds: 10 * secs,
      tags: ['v2']
    })
  })
)

router.get(
  '/v2/get-tricrypto-vault-apy',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(v2.getTricryptoVaultApy, [networkName], {
      cacheSeconds: 5 * mins,
      tags: ['v2']
    })
  })
)

router.get(
  '/get-gmx-vault-info-by-token-address',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const tokenAddress = getParamAsAddress(req, 'tokenAddress')
    return cacheFunctionResult(
      getGmxVaultInfoByTokenAddress,
      [networkName, tokenAddress],
      { cacheSeconds: 5 * mins }
    )
  })
)
router.get(
  '/v2/get-gmx-vault-info-by-token-address',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    const tokenAddress = getParamAsAddress(req, 'tokenAddress')
    return cacheFunctionResult(
      v2.getGmxVaultInfoByTokenAddress,
      [networkName, tokenAddress],
      { cacheSeconds: 5 * mins, tags: ['v2'] }
    )
  })
)

router.get(
  '/get-gmx-vault-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(getGmxVaultInfo, [networkName], {
      cacheSeconds: 10 * mins
    })
  })
)
router.get(
  '/v2/get-gmx-vault-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(v2.getGmxVaultInfo, [networkName], {
      cacheSeconds: 1 * mins,
      tags: ['v2']
    })
  })
)

router.get(
  '/v2/get-dn-gmx-vault-info',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(v2.getDnGmxVaultsInfo, [networkName], {
      cacheSeconds: 15 * secs,
      tags: ['v2']
    })
  })
)
router.get(
  '/v2/get-dn-gmx-vault-info-fast',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(v2.getDnGmxVaultsInfoFast, [networkName], {
      cacheSeconds: 15 * secs,
      tags: ['v2']
    })
  })
)

router.get(
  '/v2/get-dn-gmx-apy-breakdown',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(v2.getDnGmxApyBreakdown, [networkName], {
      cacheSeconds: 5 * mins,
      tags: ['v2']
    })
  })
)

router.get(
  '/v2/get-dn-gmx-max-deposit-withdraw',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)
    return cacheFunctionResult(v2.getDnGmxMaxDepositWithdraw, [networkName], {
      cacheSeconds: 10 * mins,
      tags: ['v2']
    })
  })
)

router.get(
  '/v2/get-mint-burn-conversion-intermediate',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)

    return cacheFunctionResult(v2.getGlpMintBurnConversionIntermediate, [networkName], {
      cacheSeconds: 10 * mins,
      tags: ['v2']
    })
  })
)

router.get(
  '/v2/get-general-data',
  handleRuntimeErrors(async (req) => {
    const networkName = getNetworkName(req)

    return cacheFunctionResult(v2.getGeneralData, [networkName], {
      cacheSeconds: 10 * mins,
      tags: ['v2']
    })
  })
)

export default router
