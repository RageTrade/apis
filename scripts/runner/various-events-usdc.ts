import type { NetworkName } from '@ragetrade/sdk'
import { chainlink, deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk'
import { BatchDepositEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/interfaces/IDnGmxBatchingManager'
import type { AssetSlippageEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/interfaces/IDnGmxJuniorVault'
import type {
  GlpSwappedEvent,
  TokenSwappedEvent,
  VaultStateEvent
} from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager'
import { BigNumber } from 'ethers'
import { parseEther } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { formatAsNum } from '../../utils'
import { juniorVault, batchingManager } from '../aggregated/util/events'
import { decimals, price } from '../aggregated/util/helpers'
import { parallelize } from '../aggregated/util/parallelize'

export async function perInterval2(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName)

  const { gmxUnderlyingVault, glpManager } = gmxProtocol.getContractsSync(
    networkName,
    provider
  )
  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)

  const { weth, wbtc, fsGLP, glp, usdc } = tokens.getContractsSync(networkName, provider)
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
        // batchingManager.depositToken
        juniorVault.deposit
        // juniorVault.withdraw
      ],
      ignoreMoreEventsInSameBlock: true,
      // TODO change block numbers here
      startBlockNumber: 74528892,
      endBlockNumber: 74537046
    },
    async (_i, blockTag, event) => {
      if (
        event.args.caller.toLowerCase() !== dnGmxBatchingManager.address.toLowerCase()
      ) {
        return null
      }

      const block = await provider.getBlock(blockTag)

      const rc = await provider.getTransactionReceipt(event.transactionHash)

      const batchDepositFilter = dnGmxBatchingManager.filters.BatchDeposit()
      const batchDepositEvents = rc.logs
        .filter((log) => log.topics[0] === batchDepositFilter.topics?.[0])
        .map((log) =>
          dnGmxBatchingManager.interface.parseLog(log)
        ) as unknown as BatchDepositEvent[]

      //
      // other
      //
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

      function getPrice_(token: string) {
        switch (token.toLowerCase()) {
          case wbtc.address.toLowerCase():
            return btcPrice
          case weth.address.toLowerCase():
            return ethPrice
          case usdc.address.toLowerCase():
            return usdcPrice
          default:
            throw new Error('i dont know')
        }
      }

      const userUsdcAmount =
        batchDepositEvents.length == 0
          ? undefined
          : formatAsNum(batchDepositEvents[0].args.userUsdcAmount, 6)
      const userGlpAmount =
        batchDepositEvents.length == 0
          ? undefined
          : formatAsNum(batchDepositEvents[0].args.userGlpAmount, 18)
      const glpPrice = formatAsNum(vaultStateParsed[0].args.glpPrice, 18)
      return {
        blockNumber: blockTag,
        timestamp: block.timestamp,
        // this
        usdcAmount: userUsdcAmount ?? 0,
        userGlpAmount,
        glpAssetsDepositFunction: event.args.assets,
        mintFee:
          userGlpAmount !== undefined && userUsdcAmount !== undefined
            ? userGlpAmount * glpPrice - userUsdcAmount
            : 0,
        // other
        slippageThresholdGmxBps,
        ethPrice,
        btcPrice,
        usdcPrice,
        tokenSwapParsed: tokenSwapParsed.reduce((acc, e) => {
          const { fromToken, toToken, fromQuantity, toQuantity } = e.args

          const fromPrice = getPrice_(fromToken)
          const fromDecimals = decimals(fromToken, networkName)
          const fromQuantityFormatted = formatAsNum(fromQuantity, fromDecimals)

          const toPrice = getPrice_(toToken)
          const toDecimals = decimals(toToken, networkName)
          const toQuantityFormatted = formatAsNum(toQuantity, toDecimals)

          // const fromDollar = fromPrice * formatAsNum(fromQuantity, fromDecimals)
          // const toDollar = toPrice * formatAsNum(toQuantity, toDecimals)
          const numerator =
            toQuantityFormatted * toPrice - fromQuantityFormatted * fromPrice
          const slippage =
            (toQuantityFormatted * toPrice - fromQuantityFormatted * fromPrice) /
            (formatAsNum(event.args.assets, 16) * usdcPrice) // todo change userUsdcAmount if needed
          const slippage2 =
            (toQuantityFormatted * toPrice - fromQuantityFormatted * fromPrice) /
            (fromQuantityFormatted * fromPrice)

          if (
            // if anyone is btc then accept
            fromToken.toLowerCase() === wbtc.address.toLowerCase() ||
            toToken.toLowerCase() === wbtc.address.toLowerCase()
          ) {
            acc.push({
              fromToken,
              toToken,
              fromQuantity: fromQuantity.toString(),
              toQuantity: toQuantity.toString(),
              numerator,
              slippage,
              slippage2
            })
            return acc
          }

          if (
            // if anyone is eth then select highest one
            fromToken.toLowerCase() === weth.address.toLowerCase()
          ) {
            let found = acc.find(
              (e) => e.fromToken.toLowerCase() === weth.address.toLowerCase()
            )
            if (found && BigNumber.from(found.fromQuantity).lt(fromQuantity)) {
              // we found something that has fromQuantity less, so overwrite it with current data
              found.fromToken = fromToken
              found.toToken = toToken
              found.fromQuantity = fromQuantity.toString()
              found.toQuantity = toQuantity.toString()
              found.numerator = numerator
              found.slippage = slippage
              found.slippage2 = slippage2
            } else {
              acc.push({
                fromToken,
                toToken,
                fromQuantity: fromQuantity.toString(),
                toQuantity: toQuantity.toString(),
                numerator,
                slippage,
                slippage2
              })
            }
          }
          return acc
        }, [] as any[])

        // vaultStateParsed: vaultStateParsed.map((e) => {
        //   const {
        //     eventType,
        //     btcBorrows,
        //     ethBorrows,
        //     btcPoolAmount,
        //     ethPoolAmount,
        //     btcTraderOIHedge,
        //     ethTraderOIHedge,
        //     glpPrice,
        //     glpBalance,
        //     totalAssets,
        //     dnUsdcDeposited,
        //     unhedgedGlpInUsdc,
        //     juniorVaultAusdc,
        //     seniorVaultAusdc
        //   } = e.args
        //   return {
        //     eventType: eventType.toString(),
        //     btcBorrows: btcBorrows.toString(),
        //     ethBorrows: ethBorrows.toString(),
        //     btcPoolAmount: btcPoolAmount.toString(),
        //     ethPoolAmount: ethPoolAmount.toString(),
        //     btcTraderOIHedge: btcTraderOIHedge.toString(),
        //     ethTraderOIHedge: ethTraderOIHedge.toString(),
        //     glpPrice: glpPrice.toString(),
        //     glpBalance: glpBalance.toString(),
        //     totalAssets: totalAssets.toString(),
        //     dnUsdcDeposited: dnUsdcDeposited.toString(),
        //     unhedgedGlpInUsdc: unhedgedGlpInUsdc.toString(),
        //     juniorVaultAusdc: juniorVaultAusdc.toString(),
        //     seniorVaultAusdc: seniorVaultAusdc.toString()
        //   }
        // }),
        // glpSwapParsed: glpSwapParsed.map((e) => {
        //   const { glpQuantity, usdcQuantity, fromGlpToUsdc } = e.args
        //   return {
        //     glpQuantity: glpQuantity.toString(),
        //     usdcQuantity: usdcQuantity.toString(),
        //     fromGlpToUsdc
        //   }
        // })
      }
    }
  )

  // return data

  const total_usdc_deposit = data.reduce((acc, cur) => acc + cur.usdcAmount, 0)
  const total_mint_fee_dollar = data.reduce((acc, cur) => acc + cur.mintFee, 0)

  const sum_numerator = data.reduce(
    (acc, cur) =>
      acc + cur.tokenSwapParsed.reduce((acc2, cur2) => acc2 + cur2.numerator, 0),
    0
  )
  const sum_slippage2 = data.reduce(
    (acc, cur) =>
      acc + cur.tokenSwapParsed.reduce((acc2, cur2) => acc2 + cur2.slippage2, 0),
    0
  )
  const count_slippage2 = data.reduce(
    (acc, cur) => acc + cur.tokenSwapParsed.reduce((acc2, cur2) => acc2 + 1, 0),
    0
  )
  const max_slippage2 = data.reduce(
    (acc, cur) =>
      Math.max(
        acc,
        cur.tokenSwapParsed.reduce(
          (acc2, cur2) => Math.max(acc2, cur2.slippage2),
          Number.MIN_SAFE_INTEGER
        )
      ),
    0
  )
  const min_slippage2 = data.reduce(
    (acc, cur) =>
      Math.min(
        acc,
        cur.tokenSwapParsed.reduce(
          (acc2, cur2) => Math.min(acc2, cur2.slippage2),
          Number.MAX_SAFE_INTEGER
        )
      ),
    0
  )

  return {
    total_usdc_deposit,
    total_mint_fee_dollar,
    total_mint_fee_percentage: total_mint_fee_dollar / total_usdc_deposit,
    total_swap_fee_dollar: sum_numerator,
    slippage_as_a_percent_of_swap_amount: {
      avg: sum_slippage2 / count_slippage2,
      max: max_slippage2,
      min: min_slippage2
    }
  }
}
