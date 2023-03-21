import type { NetworkName } from '@ragetrade/sdk'
import { chainlink, deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk'
import type {
  DepositEvent,
  WithdrawEvent
} from '@ragetrade/sdk/dist/typechain/tricrypto-vault/contracts/base/BaseVault'
import type { ethers } from 'ethers'
import { BigNumber } from 'ethers'
import { formatEther, formatUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { formatAsNum } from '../../utils'
import { juniorVault } from '../aggregated/util/events'
import { price } from '../aggregated/util/helpers'
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
      startBlockNumber: 70154289,
      endBlockNumber: 70204865
    },
    async (_i, blockTag, event) => {
      const block = await provider.getBlock(blockTag)

      const MAX_BPS = 10_000
      const { slippageThresholdGmxBps } = await dnGmxJuniorVault.getThresholds({
        blockTag
      })

      const rc = await provider.getTransactionReceipt(event.transactionHash)

      const depositFilter = dnGmxJuniorVault.filters.Deposit()
      const withdrawFilter = dnGmxJuniorVault.filters.Withdraw()

      const depositParsed = rc.logs
        .filter((log) => log.topics[0] === depositFilter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as DepositEvent[]

      const withdrawParsed = rc.logs
        .filter((log) => log.topics[0] === withdrawFilter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as WithdrawEvent[]

      const ethPrice = await ethUsdAggregator
        .latestRoundData({ blockTag })
        .then((r) => formatAsNum(r.answer, 8))
      const btcPrice = await btcUsdAggregator
        .latestRoundData({ blockTag })
        .then((r) => formatAsNum(r.answer, 8))
      const usdcPrice = await usdcUsdAggregator
        .latestRoundData({ blockTag })
        .then((r) => formatAsNum(r.answer, 8))

      const dnUsdcDeposited = await dnGmxJuniorVault
        .dnUsdcDeposited({ blockTag })
        .then((r) => formatAsNum(r, 6))
      const { currentBtc, currentEth } = await dnGmxJuniorVault
        .getCurrentBorrows({ blockTag })
        .then((r) => ({
          currentBtc: formatAsNum(r.currentBtcBorrow, 8),
          currentEth: formatAsNum(r.currentEthBorrow, 18)
        }))

      const fsGLP_balanceOf_dnGmxJuniorVault = await fsGLP
        .balanceOf(dnGmxJuniorVault.address, { blockTag })
        .then((r) => formatAsNum(r, 18))

      const totalCurrentBorrowValue = await getBorrowValue(currentBtc, currentEth)

      const glpPriceInUsdcTrue = await getGlpPriceInUsdc({ maximize: true, blockTag })
      const glpPriceInUsdcFalse = await getGlpPriceInUsdc({ maximize: false, blockTag })

      const totalAssetsTrue = await totalAssets({
        maximize: true,
        dnUsdcDeposited,
        totalCurrentBorrowValue,
        fsGLP_balanceOf_dnGmxJuniorVault,
        glpPriceInUsdcFalse,
        glpPriceInUsdcTrue
      })
      const totalAssetsFalse = await totalAssets({
        maximize: false,
        dnUsdcDeposited,
        totalCurrentBorrowValue,
        fsGLP_balanceOf_dnGmxJuniorVault,
        glpPriceInUsdcFalse,
        glpPriceInUsdcTrue
      })

      const dnGmxJuniorVault_totalSupply = await dnGmxJuniorVault
        .totalSupply({ blockTag: blockTag })
        .then((r) => formatAsNum(r, 18))

      const vaultMarketValue = await dnGmxJuniorVault
        .getVaultMarketValue({ blockTag: blockTag })
        .then((r) => formatAsNum(r, 18))

      //------------------------------------------------------//

      const dnUsdcDepositedPrev = await dnGmxJuniorVault
        .dnUsdcDeposited({ blockTag: blockTag - 1 })
        .then((r) => formatAsNum(r, 6))
      const { currentBtc: currentBtcPrev, currentEth: currentEthPrev } =
        await dnGmxJuniorVault
          .getCurrentBorrows({ blockTag: blockTag - 1 })
          .then((r) => ({
            currentBtc: formatAsNum(r.currentBtcBorrow, 8),
            currentEth: formatAsNum(r.currentEthBorrow, 18)
          }))

      const fsGLP_balanceOf_dnGmxJuniorVaultPrev = await fsGLP
        .balanceOf(dnGmxJuniorVault.address, { blockTag: blockTag - 1 })
        .then((r) => formatAsNum(r, 18))

      const totalCurrentBorrowValuePrev = await getBorrowValue(
        currentBtcPrev,
        currentEthPrev
      )

      const glpPriceInUsdcTruePrev = await getGlpPriceInUsdc({
        maximize: true,
        blockTag: blockTag - 1
      })
      const glpPriceInUsdcFalsePrev = await getGlpPriceInUsdc({
        maximize: false,
        blockTag: blockTag - 1
      })

      const totalAssetsTruePrev = await totalAssets({
        maximize: true,
        dnUsdcDeposited: dnUsdcDepositedPrev,
        totalCurrentBorrowValue: totalCurrentBorrowValuePrev,
        fsGLP_balanceOf_dnGmxJuniorVault: fsGLP_balanceOf_dnGmxJuniorVaultPrev,
        glpPriceInUsdcFalse: glpPriceInUsdcFalsePrev,
        glpPriceInUsdcTrue: glpPriceInUsdcTruePrev
      })
      const totalAssetsFalsePrev = await totalAssets({
        maximize: false,
        dnUsdcDeposited: dnUsdcDepositedPrev,
        totalCurrentBorrowValue: totalCurrentBorrowValuePrev,
        fsGLP_balanceOf_dnGmxJuniorVault: fsGLP_balanceOf_dnGmxJuniorVaultPrev,
        glpPriceInUsdcFalse: glpPriceInUsdcFalsePrev,
        glpPriceInUsdcTrue: glpPriceInUsdcTruePrev
      })

      const dnGmxJuniorVault_totalSupplyPrev = await dnGmxJuniorVault
        .totalSupply({ blockTag: blockTag - 1 })
        .then((r) => formatAsNum(r, 18))

      const vaultMarketValuePrev = await dnGmxJuniorVault
        .getVaultMarketValue({ blockTag: blockTag })
        .then((r) => formatAsNum(r, 18))

      return {
        blockNumber: blockTag,
        timestamp: block.timestamp,
        totalAssetsTrue,
        totalAssetsFalse,
        glpPriceInUsdcTrue,
        glpPriceInUsdcFalse,
        slippageThresholdGmxBps,
        ethPrice,
        btcPrice,
        usdcPrice,
        dnUsdcDeposited,
        currentBtc,
        currentEth,
        totalCurrentBorrowValue,
        dnGmxJuniorVault_totalSupply,
        fsGLP_balanceOf_dnGmxJuniorVault,
        vaultMarketValue,
        vaultMarketValuePrev,
        deposits: depositParsed.map((e) => {
          const { assets, shares } = e.args
          return {
            assets: formatUnits(assets, 18),
            shares: formatUnits(shares, 18)
          }
        }),
        withdraws: withdrawParsed.map((e) => {
          const { assets, shares } = e.args
          return {
            assets: formatUnits(assets, 18),
            shares: formatUnits(shares, 18)
          }
        }),

        //------------------------//
        blockNumberPrev: blockTag - 1,
        dnUsdcDepositedPrev,
        currentBtcPrev,
        currentEthPrev,
        fsGLP_balanceOf_dnGmxJuniorVaultPrev,
        totalAssetsTruePrev,
        totalAssetsFalsePrev,
        dnGmxJuniorVault_totalSupplyPrev
      }

      type TotalAssetsArgs = {
        maximize: boolean
        dnUsdcDeposited: number
        totalCurrentBorrowValue: number
        glpPriceInUsdcTrue: number
        glpPriceInUsdcFalse: number
        fsGLP_balanceOf_dnGmxJuniorVault: number
      }
      async function totalAssets({
        maximize,
        dnUsdcDeposited,
        totalCurrentBorrowValue,
        glpPriceInUsdcTrue,
        glpPriceInUsdcFalse,
        fsGLP_balanceOf_dnGmxJuniorVault
      }: TotalAssetsArgs) {
        let aaveProfitGlp = 0
        let aaveLossGlp = 0
        {
          const aaveProfit = dnUsdcDeposited > 0 ? dnUsdcDeposited : 0
          const aaveLoss =
            dnUsdcDeposited < 0
              ? Math.abs(-dnUsdcDeposited) + totalCurrentBorrowValue
              : totalCurrentBorrowValue

          if (aaveProfit > aaveLoss) {
            aaveProfitGlp =
              (aaveProfit - aaveLoss) /
              (!maximize ? glpPriceInUsdcTrue : glpPriceInUsdcFalse)
            if (!maximize)
              aaveProfitGlp =
                (aaveProfitGlp * (MAX_BPS - slippageThresholdGmxBps)) / MAX_BPS
            aaveLossGlp = 0
          } else {
            aaveLossGlp =
              (aaveLoss - aaveProfit) /
              (maximize ? glpPriceInUsdcTrue : glpPriceInUsdcFalse)
            if (!maximize)
              aaveLossGlp = (aaveLossGlp * (MAX_BPS + slippageThresholdGmxBps)) / MAX_BPS
            aaveProfitGlp = 0
          }
        }

        return fsGLP_balanceOf_dnGmxJuniorVault + aaveProfitGlp - aaveLossGlp
      }

      async function getBorrowValue(btcAmount: number, ethAmount: number) {
        return (btcAmount * btcPrice + ethAmount * ethPrice) / usdcPrice
      }

      type GetGlpPriceInUsdcArgs = {
        maximize: boolean
        blockTag: number
      }
      async function getGlpPriceInUsdc({ maximize, blockTag }: GetGlpPriceInUsdcArgs) {
        // aum is in 1e30
        const aum = await glpManager
          .getAum(maximize, { blockTag })
          .then((r) => formatAsNum(r, 30))
        // totalSupply is in 1e18
        const totalSupply = await fsGLP
          .totalSupply({ blockTag })
          .then((r) => formatAsNum(r, 18))

        // return aum.mulDivDown(PRICE_PRECISION, totalSupply * quotePrice * 1e16);
        return aum / totalSupply / usdcPrice
      }
    }
  )

  return data
}
