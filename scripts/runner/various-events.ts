import type { NetworkName } from '@ragetrade/sdk'
import { chainlink, deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk'
import type { AssetSlippageEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/interfaces/IDnGmxJuniorVault'
import type {
  GlpSwappedEvent,
  TokenSwappedEvent,
  VaultStateEvent
} from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager'

import { getProviderAggregate } from '../../providers'
import { formatAsNum } from '../../utils'
import { juniorVault } from '../aggregated/util/events'
import { parallelize } from '../aggregated/util/parallelize'

export async function perInterval2(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName)

  const { gmxUnderlyingVault, glpManager } = gmxProtocol.getContractsSync(
    networkName,
    provider
  )
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  )

  const { weth, wbtc, fsGLP, glp } = tokens.getContractsSync(networkName, provider)
  const { ethUsdAggregator, btcUsdAggregator } = chainlink.getContractsSync(
    networkName,
    provider
  )
  const usdcUsdAggregator = ethUsdAggregator.attach(
    '0x50834f3163758fcc1df9973b6e91f0f0f0434ad3'
  )
  // LINK / USD: https://arbiscan.io/address/0x86E53CF1B870786351Da77A57575e79CB55812CB
  // UNI / USD: https://arbiscan.io/address/0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720
  const link = wbtc.attach('0xf97f4df75117a78c1A5a0DBb814Af92458539FB4')
  const uni = wbtc.attach('0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0')
  const shortsTrackerAddress = '0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da'

  const startBlock = 55870561
  const endBlock = await provider.getBlockNumber()
  const interval = 6000

  const jones = dnGmxJuniorVault.attach('0x17ff154a329e37282eb9a76c3ae848fc277f24c7')

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        //
        juniorVault.deposit,
        juniorVault.withdraw
      ],
      ignoreMoreEventsInSameBlock: true,
      startBlockNumber: 70226483,
      endBlockNumber: 70566297
    },
    async (_i, blockTag, event) => {
      const block = await provider.getBlock(blockTag)

      const MAX_BPS = 10_000
      const { slippageThresholdGmxBps } = await dnGmxJuniorVault.getThresholds({
        blockTag
      })

      const ethPrice = await ethUsdAggregator
        .latestRoundData({ blockTag })
        .then((r) => formatAsNum(r.answer, 8))
      const btcPrice = await btcUsdAggregator
        .latestRoundData({ blockTag })
        .then((r) => formatAsNum(r.answer, 8))
      const usdcPrice = await usdcUsdAggregator
        .latestRoundData({ blockTag })
        .then((r) => formatAsNum(r.answer, 8))

      // - VaultState
      // - AssetSlippage
      // - TokenSwapped
      // - GlpSwapped

      const rc = await provider.getTransactionReceipt(event.transactionHash)

      const tokenSwapFilter = dnGmxJuniorVault.filters.TokenSwapped()
      const assetSlippageFilter = dnGmxJuniorVault.filters.AssetSlippage()
      const vaultStateFilter = dnGmxJuniorVault.filters.VaultState()
      const glpSwapFilter = dnGmxJuniorVault.filters.GlpSwapped()

      const tokenSwapParsed = rc.logs
        .filter((log) => log.topics[0] === tokenSwapFilter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as TokenSwappedEvent[]

      const assetSlippageParsed = rc.logs
        .filter((log) => log.topics[0] === assetSlippageFilter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as AssetSlippageEvent[]

      const vaultStateParsed = rc.logs
        .filter((log) => log.topics[0] === vaultStateFilter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as VaultStateEvent[]

      const glpSwapParsed = rc.logs
        .filter((log) => log.topics[0] === glpSwapFilter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as GlpSwappedEvent[]

      //   for (const event of parsed) {
      //     const fromPrice = await price(event.args.fromToken, blockNumber, networkName)

      //     const fromQuantity = Number(
      //       formatUnits(
      //         event.args.fromQuantity,
      //         decimals(event.args.fromToken, networkName)
      //       )
      //     )

      //     const fromDollar = fromPrice * fromQuantity
      //     uniswapVolume += fromDollar
      //   }

      return {
        blockNumber: blockTag,
        timestamp: block.timestamp,
        slippageThresholdGmxBps,
        ethPrice,
        btcPrice,
        usdcPrice,
        tokenSwapParsed: tokenSwapParsed.map((e) => {
          const { fromToken, toToken, fromQuantity, toQuantity } = e.args
          return {
            fromToken,
            toToken,
            fromQuantity: fromQuantity.toString(),
            toQuantity: toQuantity.toString()
          }
        }),
        assetSlippageParsed: assetSlippageParsed.map((e) => {
          const { user, slippage } = e.args
          return { user, slippage: slippage.toString() }
        }),
        vaultStateParsed: vaultStateParsed.map((e) => {
          const {
            eventType,
            btcBorrows,
            ethBorrows,
            btcPoolAmount,
            ethPoolAmount,
            btcTraderOIHedge,
            ethTraderOIHedge,
            glpPrice,
            glpBalance,
            totalAssets,
            dnUsdcDeposited,
            unhedgedGlpInUsdc,
            juniorVaultAusdc,
            seniorVaultAusdc
          } = e.args
          return {
            eventType: eventType.toString(),
            btcBorrows: btcBorrows.toString(),
            ethBorrows: ethBorrows.toString(),
            btcPoolAmount: btcPoolAmount.toString(),
            ethPoolAmount: ethPoolAmount.toString(),
            btcTraderOIHedge: btcTraderOIHedge.toString(),
            ethTraderOIHedge: ethTraderOIHedge.toString(),
            glpPrice: glpPrice.toString(),
            glpBalance: glpBalance.toString(),
            totalAssets: totalAssets.toString(),
            dnUsdcDeposited: dnUsdcDeposited.toString(),
            unhedgedGlpInUsdc: unhedgedGlpInUsdc.toString(),
            juniorVaultAusdc: juniorVaultAusdc.toString(),
            seniorVaultAusdc: seniorVaultAusdc.toString()
          }
        }),
        glpSwapParsed: glpSwapParsed.map((e) => {
          const { glpQuantity, usdcQuantity, fromGlpToUsdc } = e.args
          return {
            glpQuantity: glpQuantity.toString(),
            usdcQuantity: usdcQuantity.toString(),
            fromGlpToUsdc
          }
        })
      }
    }
  )

  return data
}
