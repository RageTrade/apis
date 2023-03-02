import type { NetworkName } from '@ragetrade/sdk'
import { chainlink, deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk'
import { BigNumber } from 'ethers'
import { fetchJson, formatEther } from 'ethers/lib/utils'

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
  fsGlp_balanceOf_batchingManager: number
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

  ethPnl: number
  btcPnl: number
  linkPnl: number
  uniPnl: number
  pnl: number
}>

export interface GlobalMarketMovementDailyEntry {
  startTimestamp: number
  endTimestamp: number
  ethPnlNet: number
  btcPnlNet: number
  linkPnlNet: number
  uniPnlNet: number
  pnlNet: number
}
export interface GlobalMarketMovementResult {
  data: GlobalMarketMovementEntry[]
  dailyData: GlobalMarketMovementDailyEntry[]
  dataLength: number
  totalEthPnl: number
  totalBtcPnl: number
  totalLinkPnl: number
  totalUniPnl: number
  totalPnl: number
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

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)
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

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        gmxVault.increasePoolAmount,
        gmxVault.decreasePoolAmount
      ],
      ignoreMoreEventsInSameBlock: true,
      startBlockNumber: ENV.START_BLOCK_NUMBER
    },
    async (_i, blockNumber, event) => {
      const block = await provider.getBlock(blockNumber)
      if (!block) return null

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

      const wethReservedAmounts = await gmxUnderlyingVault
        .reservedAmounts(weth.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const wbtcReservedAmounts = await gmxUnderlyingVault
        .reservedAmounts(wbtc.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 8))

      const wethShortAveragePrice = await shortTracker
        .globalShortAveragePrices(weth.address, { blockTag: blockNumber })
        .then((res) => formatAsNum(res, 30))

      const wbtcShortAveragePrice = await shortTracker
        .globalShortAveragePrices(wbtc.address, { blockTag: blockNumber })
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

      const [wethPrice, wbtcPrice] = await Promise.all([
        price(weth.address, blockNumber, networkName),
        price(wbtc.address, blockNumber, networkName)
      ])

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

      const fsGlp_balanceOf_batchingManager = await dnGmxBatchingManager
        .dnGmxJuniorVaultGlpBalance({ blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const totalGLPSupply = await glp
        .totalSupply({ blockTag: blockNumber })
        .then((res) => formatAsNum(res, 18))

      const totalUsdcAmount = Number(
        formatEther(poolAmounts.reduce((a, b) => a.add(b), BigNumber.from(0)))
      )

      const vaultGlp = fsGlp_balanceOf_juniorVault + fsGlp_balanceOf_batchingManager

      // (poolAmount - reserveAmount) + (shortSize / averagePrice)
      const wethTokenWeight =
        wethPoolAmount - wethReservedAmounts + wethShortSizes / wethShortAveragePrice

      const wbtcTokenWeight =
        wbtcPoolAmount - wbtcReservedAmounts + wbtcShortSizes / wbtcShortAveragePrice

      const linkTokenWeight = linkPoolAmount
      const uniTokenWeight = uniPoolAmount

      const wethCurrentToken = (wethTokenWeight * vaultGlp) / totalGLPSupply
      const wbtcCurrentToken = (wbtcTokenWeight * vaultGlp) / totalGLPSupply
      const linkCurrentToken = (linkTokenWeight * vaultGlp) / totalGLPSupply
      const uniCurrentToken = (uniTokenWeight * vaultGlp) / totalGLPSupply

      return {
        blockNumber: blockNumber,
        eventName: event.event ?? 'unknown',
        timestamp: block.timestamp,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
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
        uniCurrentToken
      }
    }
  )

  const extraData: Entry<{
    ethPnl: number
    btcPnl: number
    uniPnl: number
    linkPnl: number
    pnl: number
  }>[] = []

  let last
  for (const current of data) {
    if (last) {
      const ethPnl = last.wethCurrentToken * (current.wethPrice - last.wethPrice)
      const btcPnl = last.wbtcCurrentToken * (current.wbtcPrice - last.wbtcPrice)
      const uniPnl = last.uniCurrentToken * (current.uniPrice - last.uniPrice)
      const linkPnl = last.linkCurrentToken * (current.linkPrice - last.linkPrice)

      extraData.push({
        blockNumber: current.blockNumber,
        ethPnl,
        btcPnl,
        uniPnl,
        linkPnl,
        pnl: ethPnl + btcPnl + uniPnl + linkPnl
      })
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        ethPnl: 0,
        btcPnl: 0,
        uniPnl: 0,
        linkPnl: 0,
        pnl: 0
      })
    }
    last = current
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
          lastEntry.btcPnlNet += cur.btcPnl
          lastEntry.ethPnlNet += cur.ethPnl
          lastEntry.uniPnlNet += cur.uniPnl
          lastEntry.linkPnlNet += cur.linkPnl
          lastEntry.pnlNet += cur.pnl
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days < timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              btcPnlNet: 0,
              ethPnlNet: 0,
              uniPnlNet: 0,
              linkPnlNet: 0,
              pnlNet: 0
            })
            lastEntry = acc[acc.length - 1]
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            btcPnlNet: cur.btcPnl,
            ethPnlNet: cur.ethPnl,
            uniPnlNet: cur.uniPnl,
            linkPnlNet: cur.linkPnl,
            pnlNet: cur.pnl
          })
        }
        return acc
      },
      []
    ),
    dataLength: data.length,
    totalBtcPnl: combinedData.reduce((acc, cur) => acc + cur.btcPnl, 0),
    totalEthPnl: combinedData.reduce((acc, cur) => acc + cur.ethPnl, 0),
    totalUniPnl: combinedData.reduce((acc, cur) => acc + cur.uniPnl, 0),
    totalLinkPnl: combinedData.reduce((acc, cur) => acc + cur.linkPnl, 0),
    totalPnl: combinedData.reduce((acc, cur) => acc + cur.pnl, 0)
  }
}
