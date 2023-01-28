import type { NetworkName, ResultWithMetadata } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, formatUsdc, priceX128ToPrice, Q128 } from '@ragetrade/sdk'
import type { ethers } from 'ethers'
import { BigNumber } from 'ethers'
import { fetchJson, formatUnits, parseUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import type { GlobalTraderPnlResult } from './trader-pnl'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type VaultInfoEntry = Entry<{
  timestamp: number
  juniorVaultInfo: {
    assetPrice: number
    sharePrice: number
  }
  seniorVaultInfo: {
    assetPrice: number
    sharePrice: number
  }
}>

export interface VaultInfoResult {
  data: VaultInfoEntry[]
}

export async function getVaultInfo(networkName: NetworkName): Promise<VaultInfoResult> {
  const provider = getProviderAggregate(networkName)

  const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)

  // this api contains extra block numbers
  const traderPnlData: ResultWithMetadata<GlobalTraderPnlResult> = await fetchJson({
    url: `http://localhost:3000/data/aggregated/get-trader-pnl?networkName=${networkName}`,
    timeout: 1_000_000_000 // huge number
  })

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        // additional block numbers from trader pnl
        () => {
          const uniqueBlockNumbers = Array.from(
            new Set(traderPnlData.result.data.map((entry) => entry.blockNumber))
          )
          return uniqueBlockNumbers.map(
            (blockNumber) =>
              ({
                blockNumber,
                event: 'unknown',
                transactionHash: 'unknown',
                logIndex: -1
              } as ethers.Event)
          )
        }
      ],
      ignoreMoreEventsInSameBlock: true // to prevent reprocessing same data
    },
    async (_i, blockNumber, event) => {
      const { timestamp } = await provider.getBlock(blockNumber)

      const juniorVaultInfo = await getJuniorVaultInfo(blockNumber)
      const seniorVaultInfo = await getSeniorVaultInfo(blockNumber)

      return {
        blockNumber,
        transactionHash: event.transactionHash,
        timestamp,
        juniorVaultInfo,
        seniorVaultInfo
      }
    }
  )

  return { data }

  async function getJuniorVaultInfo(blockNumber: number) {
    const priceD18 = await dnGmxJuniorVault.getPrice(false, {
      blockTag: blockNumber
    })
    const assetPrice = Number(formatUnits(priceD18, 18))
    const assetPriceX128 = priceD18.mul(Q128).div(BigNumber.from(10).pow(18 + 12))

    const assetsPerShareD18 = await dnGmxJuniorVault.convertToAssets(
      parseUnits('1', 18),
      { blockTag: blockNumber }
    )
    const sharePrice = Number(
      (
        await priceX128ToPrice(
          assetPriceX128.mul(assetsPerShareD18).div(parseUnits('1', 18)),
          6,
          18
        )
      ).toFixed(6)
    )

    const vaultMarketValue = Number(
      formatUsdc(
        await dnGmxJuniorVault.getVaultMarketValue({
          blockTag: blockNumber
        })
      )
    )
    return { assetPrice, sharePrice, vaultMarketValue }
  }

  async function getSeniorVaultInfo(blockNumber: number) {
    const assetPriceX128 = await dnGmxSeniorVault.getPriceX128({
      blockTag: blockNumber
    })
    const assetPrice = await priceX128ToPrice(assetPriceX128, 6, 6)

    const assetsPerShareD6 = await dnGmxSeniorVault.convertToAssets(parseUnits('1', 6), {
      blockTag: blockNumber
    })
    const assetsPerShare = assetsPerShareD6
    const sharePrice = Number(
      (
        await priceX128ToPrice(
          assetPriceX128.mul(assetsPerShare).div(parseUnits('1', 6)),
          6,
          6
        )
      ).toFixed(6)
    )

    const vaultMarketValue = Number(
      formatUsdc(
        await dnGmxSeniorVault.getVaultMarketValue({
          blockTag: blockNumber
        })
      )
    )
    return { assetPrice, sharePrice, vaultMarketValue }
  }
}
