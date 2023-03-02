import { BigNumber, BigNumberish, ethers } from 'ethers'
import { formatUnits, hexDataSlice } from 'ethers/lib/utils'

import { deltaNeutralGmxVaults, gmxProtocol, NetworkName, tokens } from '@ragetrade/sdk'
import { IERC20 } from '@ragetrade/sdk/dist/typechain/core'

import { getProviderAggregate } from '../../../providers'
import { juniorVault } from '../util/events'
import { parallelize } from '../util/parallelize'

import type { Entry } from '../util/types'
import { price } from '../util/helpers'
export type RebalanceInfoEntry = Entry<{
  blockNumber: number
  timestamp: number

  btcTraderOIHedgeRage: number
  ethTraderOIHedgeRage: number

  btcTraderOIHedgeGmx: number
  ethTraderOIHedgeGmx: number

  wbtcPrice: number
  wethPrice: number
}>

export interface RebalanceInfoResult {
  data: RebalanceInfoEntry[]
  dataLength: number
}

export async function getRebalanceInfo(
  networkName: NetworkName
): Promise<RebalanceInfoResult> {
  const provider = getProviderAggregate(networkName)

  const { weth, wbtc } = tokens.getContractsSync(networkName, provider)

  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)
  const { dnGmxJuniorVault, dnGmxTraderHedgeStrategy } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)
  const { DnGmxTraderHedgeStrategyDeployment } =
    deltaNeutralGmxVaults.getDeployments(networkName)
  console.log(DnGmxTraderHedgeStrategyDeployment.receipt?.blockNumber)

  const data = await parallelize<RebalanceInfoEntry>(
    {
      networkName,
      provider,
      getEvents: [juniorVault.rebalanced],
      startBlockNumber:
        DnGmxTraderHedgeStrategyDeployment.receipt?.blockNumber ?? 45412307
    },
    async (_i, blockNumber) => {
      const block = await provider.getBlock(blockNumber)
      if (!block) return null

      const timestamp = block.timestamp

      let traderOIHedgeBps = 0
      try {
        traderOIHedgeBps = await dnGmxTraderHedgeStrategy.traderOIHedgeBps({
          blockTag: blockNumber
        })
      } catch {}
      async function traderOIHedgeGmx(token: IERC20, decimals: number) {
        const reservedAmount = Number(
          formatUnits(
            await gmxUnderlyingVault.reservedAmounts(token.address, {
              blockTag: blockNumber
            }),
            decimals
          )
        )
        const globalShortSize = Number(
          formatUnits(
            await gmxUnderlyingVault.globalShortSizes(token.address, {
              blockTag: blockNumber
            }),
            30
          )
        )
        const globalShortAveragePrice = Number(
          formatUnits(
            await gmxUnderlyingVault.globalShortAveragePrices(token.address, {
              blockTag: blockNumber
            }),
            30
          )
        )

        const maxBps = 10000
        return (
          ((reservedAmount - globalShortSize / globalShortAveragePrice) *
            traderOIHedgeBps) /
          maxBps
        )
      }

      const btcTraderOIHedgeGmx = await traderOIHedgeGmx(wbtc, 8)
      const ethTraderOIHedgeGmx = await traderOIHedgeGmx(weth, 18)

      const slotFor_btcTraderOIHedge_ethTraderOIHedge = 252 + 35
      const word = await provider.getStorageAt(
        dnGmxJuniorVault.address,
        slotFor_btcTraderOIHedge_ethTraderOIHedge,
        blockNumber
      )

      const btcTraderOIHedgeRage = Number(
        formatUnits(parseInt128(hexDataSlice(word, 16, 32)), 8)
      )
      const ethTraderOIHedgeRage = Number(
        formatUnits(parseInt128(hexDataSlice(word, 0, 16)), 18)
      )

      const wbtcPrice = await price(wbtc.address, blockNumber, networkName)
      const wethPrice = await price(weth.address, blockNumber, networkName)

      const v: RebalanceInfoEntry = {
        blockNumber,
        timestamp,

        btcTraderOIHedgeGmx,
        ethTraderOIHedgeGmx,

        btcTraderOIHedgeRage,
        ethTraderOIHedgeRage,

        wbtcPrice,
        wethPrice
      }

      return v
    }
  )

  return { data, dataLength: data.length }
}

function parseInt128(val: BigNumberish): BigNumber {
  val = ethers.BigNumber.from(val)
  if (val.gt(1n << 127n)) {
    val = BigNumber.from(1).shl(128).sub(val)
  }
  return val
}
