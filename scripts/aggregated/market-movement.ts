import type { NetworkName } from '@ragetrade/sdk'
import {
  chainlink,
  deltaNeutralGmxVaults,
  gmxProtocol,
  IERC20Metadata__factory,
  tokens
} from '@ragetrade/sdk'
import { BigNumber, ethers } from 'ethers'
import { fetchJson, formatEther, formatUnits } from 'ethers/lib/utils'

import { ENV } from '../../env'
import { getProviderAggregate } from '../../providers'
import { days, formatAsNum, timestampRoundDown } from '../../utils'
import { intersection } from './util/combine'
import { gmxVault, juniorVault } from './util/events'
import { ShortsTracker__factory } from './util/events/gmx-vault/contracts'
import { price } from './util/helpers'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type GlobalMarketMovementEntry = Entry<{
  timestamp: number

  fsGlp_balanceOf_juniorVault: number
  // fsGlp_balanceOf_batchingManager: number
  glp_totalSupply: number
  vaultGlp: number
  glpPrice: number
  wethPoolAmount: number
  wbtcPoolAmount: number
  linkPoolAmount: number
  uniPoolAmount: number
  wethReservedAmounts: number
  wethShortSizes: number
  wethShortAveragePrice: number
  wbtcReservedAmounts: number
  wbtcShortSizes: number
  wbtcShortAveragePrice: number
  totalUsdcAmount: number
  wethTokenWeight: number
  wbtcTokenWeight: number
  linkTokenWeight: number
  uniTokenWeight: number
  wethPrice: number
  wbtcPrice: number
  linkPrice: number
  uniPrice: number
  wethCurrentToken: number
  wbtcCurrentToken: number
  linkCurrentToken: number
  uniCurrentToken: number
  wethUsdgAmount: number
  wbtcUsdgAmount: number
  linkUsdgAmount: number
  uniUsdgAmount: number
  totalUsdgAmount: number
  linkShortSizes: number
  uniShortSizes: number
  linkReservedAmounts: number
  uniReservedAmounts: number
  linkShortAveragePrice: number
  uniShortAveragePrice: number

  unhedgedTraderPnl: number

  wethMaxPrice: number
  wethMinPrice: number
  wbtcMaxPrice: number
  wbtcMinPrice: number
  linkMaxPrice: number
  linkMinPrice: number
  uniMaxPrice: number
  uniMinPrice: number

  wethAvgPrice: number
  wbtcAvgPrice: number
  linkAvgPrice: number
  uniAvgPrice: number

  wethGuaranteedUsdAmount: number
  wbtcGuaranteedUsdAmount: number
  linkGuaranteedUsdAmount: number
  uniGuaranteedUsdAmount: number

  traderOIHedgeBps: number
}> &
  ExtraEntry

export type ExtraEntry = Entry<{
  unhedgedTraderPnl: number
  ethUnhedgedTraderPnl: number
  btcUnhedgedTraderPnl: number
  uniUnhedgedTraderPnl: number
  linkUnhedgedTraderPnl: number
}>

export interface GlobalMarketMovementDailyEntry {
  startTimestamp: number
  endTimestamp: number
  unhedgedTraderPnl: number
  ethUnhedgedTraderPnlNet: number
  btcUnhedgedTraderPnlNet: number
  uniUnhedgedTraderPnlNet: number
  linkUnhedgedTraderPnlNet: number
}

export interface GlobalMarketMovementResult {
  data: GlobalMarketMovementEntry[]
  dailyData: GlobalMarketMovementDailyEntry[]
  dataLength: number
  totalUnhedgedTraderPnl: number
}

export async function getMarketMovement(
  networkName: NetworkName,
  excludeRawData: boolean
): Promise<GlobalMarketMovementResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-market-movement?networkName=${networkName}`,
      timeout: 1_000_000_000 // huge number
    })
    delete resp.result.data
    return resp.result
  }

  const provider = getProviderAggregate(networkName)

  const { dnGmxJuniorVault, dnGmxTraderHedgeStrategy } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)
  const iface = [
    'function positions(bytes32 key) external view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 reserveAmount, int256 realisedPnl, uint256 lastIncreasedTime)',
    'function getPositionKey(address _account, address _collateralToken, address _indexToken, bool _isLong) public pure returns (bytes32)',
    'function getMaxPrice(address _token) public view returns (uint256)',
    'function getMinPrice(address _token) public view returns (uint256)'
  ]

  const _gmxUnderlyingVault = new ethers.Contract(
    gmxUnderlyingVault.address,
    iface,
    provider
  )

  const { weth, wbtc, fsGLP, glp } = tokens.getContractsSync(networkName, provider)
  const { ethUsdAggregator } = chainlink.getContractsSync(networkName, provider)
  const shortTracker = ShortsTracker__factory.connect(
    '0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da',
    provider
  )

  // LINK / USD: https://arbiscan.io/address/0x86E53CF1B870786351Da77A57575e79CB55812CB
  // UNI / USD: https://arbiscan.io/address/0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720

  const link = wbtc.attach('0xf97f4df75117a78c1A5a0DBb814Af92458539FB4')
  const uni = wbtc.attach('0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0')
  const linkUsdAggregator = ethUsdAggregator.attach(
    '0x86E53CF1B870786351Da77A57575e79CB55812CB'
  )
  const uniUsdAggregator = ethUsdAggregator.attach(
    '0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720'
  )

  const allWhitelistedTokensLength = (
    await gmxUnderlyingVault.allWhitelistedTokensLength()
  ).toNumber()
  const allWhitelistedTokens: string[] = []
  for (let i = 0; i < allWhitelistedTokensLength; i++) {
    allWhitelistedTokens.push(await gmxUnderlyingVault.allWhitelistedTokens(i))
  }
  const allWhitelistedTokensName = await Promise.all(
    allWhitelistedTokens.map(async (tokenAddress) => {
      const token = IERC20Metadata__factory.connect(tokenAddress, provider)
      return token.name()
    })
  )

  // const startBlock = 65567250
  // const endBlock = await provider.getBlockNumber()
  const startBlock = ENV.START_BLOCK_NUMBER
  const endBlock = 68048150

  const interval = 500

  const data = await parallelize(
    {
      label: 'getMarketMovement',
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        gmxVault.increasePoolAmount,
        gmxVault.decreasePoolAmount,
        gmxVault.increaseReservedAmount,
        gmxVault.decreaseReservedAmount
        // () => {
        //   const events = [{ blockNumber: 68607760 }, { blockNumber: 68607761 }]
        // for (let i = startBlock; i <= endBlock; i += interval) {
        //   events.push({
        //     blockNumber: i
        //   })
        // }
        //   return events as ethers.Event[]
        // }
      ],
      ignoreMoreEventsInSameBlock: true,
      startBlockNumber: startBlock
      // endBlockNumber: endBlock
    },
    async (_i, blockNumber, event) => {
      const block = await provider.getBlock(blockNumber)
      if (!block) return null

      const usdgAmounts = await Promise.all(
        allWhitelistedTokens.map((token) =>
          gmxUnderlyingVault.usdgAmounts(token, { blockTag: blockNumber })
        )
      )

      const wethUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(weth.address, {
            blockTag: blockNumber
          })
        )
      )
      const wbtcUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(wbtc.address, {
            blockTag: blockNumber
          })
        )
      )
      const linkUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(link.address, {
            blockTag: blockNumber
          })
        )
      )
      const uniUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(uni.address, {
            blockTag: blockNumber
          })
        )
      )

      const totalUsdgAmount = Number(
        formatEther(usdgAmounts.reduce((a, b) => a.add(b), BigNumber.from(0)))
      )

      const poolAmounts = await Promise.all(
        allWhitelistedTokens.map((token) =>
          gmxUnderlyingVault.poolAmounts(token, { blockTag: blockNumber })
        )
      )

      const wethShortSizes = await gmxUnderlyingVault
        .globalShortSizes(weth.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const wbtcShortSizes = await gmxUnderlyingVault
        .globalShortSizes(wbtc.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const linkShortSizes = await gmxUnderlyingVault
        .globalShortSizes(link.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const uniShortSizes = await gmxUnderlyingVault
        .globalShortSizes(uni.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const wethReservedAmounts = await gmxUnderlyingVault
        .reservedAmounts(weth.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const wbtcReservedAmounts = await gmxUnderlyingVault
        .reservedAmounts(wbtc.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 8))

      const linkReservedAmounts = await gmxUnderlyingVault
        .reservedAmounts(link.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const uniReservedAmounts = await gmxUnderlyingVault
        .reservedAmounts(uni.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const wethShortAveragePrice = await shortTracker
        .globalShortAveragePrices(weth.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const wbtcShortAveragePrice = await shortTracker
        .globalShortAveragePrices(wbtc.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const linkShortAveragePrice = await shortTracker
        .globalShortAveragePrices(link.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const uniShortAveragePrice = await shortTracker
        .globalShortAveragePrices(uni.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const wethPoolAmount = await gmxUnderlyingVault
        .poolAmounts(weth.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const wbtcPoolAmount = await gmxUnderlyingVault
        .poolAmounts(wbtc.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 8))

      const linkPoolAmount = await gmxUnderlyingVault
        .poolAmounts(link.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const uniPoolAmount = await gmxUnderlyingVault
        .poolAmounts(uni.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const wethGuaranteedUsdAmount = await gmxUnderlyingVault
        .guaranteedUsd(weth.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const wbtcGuaranteedUsdAmount = await gmxUnderlyingVault
        .guaranteedUsd(wbtc.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const linkGuaranteedUsdAmount = await gmxUnderlyingVault
        .guaranteedUsd(link.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const uniGuaranteedUsdAmount = await gmxUnderlyingVault
        .guaranteedUsd(uni.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const wethPrice = await price(weth.address, blockNumber, networkName)
      const wbtcPrice = await price(wbtc.address, blockNumber, networkName)

      const glpPrice = await dnGmxJuniorVault
        .getPrice(false, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const linkPrice = await linkUsdAggregator
        .latestRoundData({ blockTag: blockNumber })
        .then((res) => formatAsNum(res.answer, 8))

      const uniPrice = await uniUsdAggregator
        .latestRoundData({ blockTag: blockNumber })
        .then((res) => formatAsNum(res.answer, 8))

      const fsGlp_balanceOf_juniorVault = await fsGLP
        .balanceOf(dnGmxJuniorVault.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      // const fsGlp_balanceOf_batchingManager = await dnGmxBatchingManager
      //   .dnGmxJuniorVaultGlpBalance({ blockTag: blockNumber })
      //   .then((res) => formatAsNum(res, 18))

      const totalGLPSupply = await glp
        .totalSupply({ blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const totalUsdcAmount = Number(
        formatEther(poolAmounts.reduce((a, b) => a.add(b), BigNumber.from(0)))
      )

      const vaultGlp = fsGlp_balanceOf_juniorVault

      let traderOIHedgeBps = 0
      try {
        traderOIHedgeBps = await dnGmxTraderHedgeStrategy.traderOIHedgeBps({
          blockTag: blockNumber
        })

        traderOIHedgeBps = traderOIHedgeBps / 10_000
      } catch (err) {
        console.error('traderOIHedgeBps call failed', err)
      }

      // (poolAmount - traderOIHedgeBps * reserveAmount) + traderOIHedgeBps * (shortSize / averagePrice)
      const wethTokenWeight =
        wethPoolAmount -
        traderOIHedgeBps * wethReservedAmounts +
        traderOIHedgeBps * (wethShortSizes / wethShortAveragePrice)

      const wbtcTokenWeight =
        wbtcPoolAmount -
        traderOIHedgeBps * wbtcReservedAmounts +
        traderOIHedgeBps * (wbtcShortSizes / wbtcShortAveragePrice)

      const linkTokenWeight = linkPoolAmount
      const uniTokenWeight = uniPoolAmount

      const wethCurrentToken = (wethTokenWeight * vaultGlp) / totalGLPSupply
      const wbtcCurrentToken = (wbtcTokenWeight * vaultGlp) / totalGLPSupply
      const linkCurrentToken = (linkTokenWeight * vaultGlp) / totalGLPSupply
      const uniCurrentToken = (uniTokenWeight * vaultGlp) / totalGLPSupply

      const wethMaxPrice = await _gmxUnderlyingVault
        .getMaxPrice(weth.address, {
          blockTag: blockNumber
        })
        .then((res: any) => Number(formatUnits(res, 30)))
      const wethMinPrice = await _gmxUnderlyingVault
        .getMinPrice(weth.address, {
          blockTag: blockNumber
        })
        .then((res: any) => Number(formatUnits(res, 30)))

      const wbtcMaxPrice = await _gmxUnderlyingVault
        .getMaxPrice(wbtc.address, {
          blockTag: blockNumber
        })
        .then((res: any) => Number(formatUnits(res, 30)))
      const wbtcMinPrice = await _gmxUnderlyingVault
        .getMinPrice(wbtc.address, {
          blockTag: blockNumber
        })
        .then((res: any) => Number(formatUnits(res, 30)))

      const linkMaxPrice = await _gmxUnderlyingVault
        .getMaxPrice(link.address, {
          blockTag: blockNumber
        })
        .then((res: any) => Number(formatUnits(res, 30)))
      const linkMinPrice = await _gmxUnderlyingVault
        .getMinPrice(link.address, {
          blockTag: blockNumber
        })
        .then((res: any) => Number(formatUnits(res, 30)))

      const uniMaxPrice = await _gmxUnderlyingVault
        .getMaxPrice(uni.address, {
          blockTag: blockNumber
        })
        .then((res: any) => Number(formatUnits(res, 30)))
      const uniMinPrice = await _gmxUnderlyingVault
        .getMinPrice(uni.address, {
          blockTag: blockNumber
        })
        .then((res: any) => Number(formatUnits(res, 30)))

      const wbtcAvgPrice = (wbtcMaxPrice + wbtcMinPrice) / 2
      const wethAvgPrice = (wethMaxPrice + wethMinPrice) / 2
      const linkAvgPrice = (linkMaxPrice + linkMinPrice) / 2
      const uniAvgPrice = (uniMaxPrice + uniMinPrice) / 2

      return {
        blockNumber: blockNumber,
        eventName: event.event ?? 'unknown',
        timestamp: block.timestamp,
        fsGlp_balanceOf_juniorVault,
        // fsGlp_balanceOf_batchingManager,
        glp_totalSupply: totalGLPSupply,
        vaultGlp,
        glpPrice,
        wethPoolAmount,
        wbtcPoolAmount,
        linkPoolAmount,
        uniPoolAmount,
        wethReservedAmounts,
        wethShortSizes,
        wethShortAveragePrice,
        wbtcReservedAmounts,
        wbtcShortSizes,
        wbtcShortAveragePrice,
        totalUsdcAmount,
        wethTokenWeight,
        wbtcTokenWeight,
        linkTokenWeight,
        uniTokenWeight,
        wethPrice,
        wbtcPrice,
        linkPrice,
        uniPrice,
        wethCurrentToken,
        wbtcCurrentToken,
        linkCurrentToken,
        uniCurrentToken,
        wethUsdgAmount,
        wbtcUsdgAmount,
        linkUsdgAmount,
        uniUsdgAmount,
        totalUsdgAmount,
        linkShortSizes,
        uniShortSizes,
        linkReservedAmounts,
        uniReservedAmounts,
        linkShortAveragePrice,
        uniShortAveragePrice,
        wethMaxPrice,
        wethMinPrice,
        wbtcMaxPrice,
        wbtcMinPrice,
        linkMaxPrice,
        linkMinPrice,
        uniMaxPrice,
        uniMinPrice,
        wethAvgPrice,
        wbtcAvgPrice,
        linkAvgPrice,
        uniAvgPrice,
        wethGuaranteedUsdAmount,
        wbtcGuaranteedUsdAmount,
        linkGuaranteedUsdAmount,
        uniGuaranteedUsdAmount,
        traderOIHedgeBps,
        ...Object.fromEntries(
          allWhitelistedTokensName.map((tokenName, i) => [
            tokenName,
            Number(formatEther(usdgAmounts[i]))
          ])
        )
      }
    }
  )

  const extraData: ExtraEntry[] = []

  for (let i = 0; i < data.length; i++) {
    const current = data[i]
    const next = data[i + 1]

    if (next) {
      const ethUnhedgedTraderPnl =
        ((current.wethReservedAmounts -
          current.wethShortSizes / current.wethShortAveragePrice) *
          (1 - current.traderOIHedgeBps) *
          (next.wethAvgPrice - current.wethAvgPrice) *
          current.vaultGlp) /
        current.glp_totalSupply

      const btcUnhedgedTraderPnl =
        ((current.wbtcReservedAmounts -
          current.wbtcShortSizes / current.wbtcShortAveragePrice) *
          (1 - current.traderOIHedgeBps) *
          (next.wbtcAvgPrice - current.wbtcAvgPrice) *
          current.vaultGlp) /
        current.glp_totalSupply

      const uniUnhedgedTraderPnl =
        ((current.uniReservedAmounts -
          current.uniShortSizes / current.uniShortAveragePrice) *
          (next.uniAvgPrice - current.uniAvgPrice) *
          current.vaultGlp) /
        current.glp_totalSupply

      const linkUnhedgedTraderPnl =
        ((current.linkReservedAmounts -
          current.linkShortSizes / current.linkShortAveragePrice) *
          (next.linkAvgPrice - current.linkAvgPrice) *
          current.vaultGlp) /
        current.glp_totalSupply

      extraData.push({
        blockNumber: current.blockNumber,
        ethUnhedgedTraderPnl,
        btcUnhedgedTraderPnl,
        uniUnhedgedTraderPnl,
        linkUnhedgedTraderPnl,
        unhedgedTraderPnl:
          ethUnhedgedTraderPnl +
          btcUnhedgedTraderPnl +
          uniUnhedgedTraderPnl +
          linkUnhedgedTraderPnl
      })
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        ethUnhedgedTraderPnl: 0,
        btcUnhedgedTraderPnl: 0,
        uniUnhedgedTraderPnl: 0,
        linkUnhedgedTraderPnl: 0,
        unhedgedTraderPnl: 0
      })
    }
  }

  const combinedData = intersection(data, extraData, (a, b) => ({
    ...a,
    ...b
  }))

  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalMarketMovementDailyEntry[], cur: GlobalMarketMovementEntry) => {
        let lastEntry = acc[acc.length - 1]
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.unhedgedTraderPnl += cur.unhedgedTraderPnl
          lastEntry.ethUnhedgedTraderPnlNet += cur.ethUnhedgedTraderPnl
          lastEntry.btcUnhedgedTraderPnlNet += cur.btcUnhedgedTraderPnl
          lastEntry.uniUnhedgedTraderPnlNet += cur.uniUnhedgedTraderPnl
          lastEntry.linkUnhedgedTraderPnlNet += cur.linkUnhedgedTraderPnl
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days < timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              unhedgedTraderPnl: 0,
              ethUnhedgedTraderPnlNet: 0,
              btcUnhedgedTraderPnlNet: 0,
              uniUnhedgedTraderPnlNet: 0,
              linkUnhedgedTraderPnlNet: 0
            })
            lastEntry = acc[acc.length - 1]
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            unhedgedTraderPnl: cur.unhedgedTraderPnl,
            ethUnhedgedTraderPnlNet: cur.ethUnhedgedTraderPnl,
            btcUnhedgedTraderPnlNet: cur.btcUnhedgedTraderPnl,
            uniUnhedgedTraderPnlNet: cur.uniUnhedgedTraderPnl,
            linkUnhedgedTraderPnlNet: cur.linkUnhedgedTraderPnl
          })
        }
        return acc
      },
      []
    ),
    dataLength: data.length,
    totalUnhedgedTraderPnl: combinedData.reduce(
      (acc, cur) => acc + cur.unhedgedTraderPnl,
      0
    )
  }
}
