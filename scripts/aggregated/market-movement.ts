import type { NetworkName } from '@ragetrade/sdk'
import { chainlink, deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk'
import { BigNumber, ethers } from 'ethers'
import { fetchJson, formatEther, formatUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { days, timestampRoundDown } from '../../utils'
import { intersection } from './util/combine'
import { gmxVault, juniorVault } from './util/events'
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
  wethUsdgAmount: number
  wbtcUsdgAmount: number
  linkUsdgAmount: number
  uniUsdgAmount: number
  totalUsdcAmount: number
  wethTokenWeight: number
  wbtcTokenWeight: number
  linkTokenWeight: number
  uniTokenWeight: number
  wethMaxPrice: number
  wethMinPrice: number
  wbtcMaxPrice: number
  wbtcMinPrice: number
  linkMaxPrice: number
  linkMinPrice: number
  uniMaxPrice: number
  uniMinPrice: number
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

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        gmxVault.increaseUsdgAmount,
        gmxVault.decreaseUsdgAmount
      ],
      ignoreMoreEventsInSameBlock: true,
      startBlockNumber: 45412307
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

      const totalUsdcAmount = Number(
        formatEther(usdgAmounts.reduce((a, b) => a.add(b), BigNumber.from(0)))
      )

      const wethTokenWeight = wethUsdgAmount / totalUsdcAmount
      const wbtcTokenWeight = wbtcUsdgAmount / totalUsdcAmount
      const linkTokenWeight = linkUsdgAmount / totalUsdcAmount
      const uniTokenWeight = uniUsdgAmount / totalUsdcAmount

      const glpPrice = Number(
        formatEther(
          await dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber
          })
        )
      )

      const wethMaxPrice = await _gmxUnderlyingVault
        .getMaxPrice(weth.address, {
          blockTag: blockNumber
        })
        .then((res: any) => formatUnits(res, 30))
      const wethMinPrice = await _gmxUnderlyingVault
        .getMinPrice(weth.address, {
          blockTag: blockNumber
        })
        .then((res: any) => formatUnits(res, 30))

      const wbtcMaxPrice = await _gmxUnderlyingVault
        .getMaxPrice(wbtc.address, {
          blockTag: blockNumber
        })
        .then((res: any) => formatUnits(res, 30))
      const wbtcMinPrice = await _gmxUnderlyingVault
        .getMinPrice(wbtc.address, {
          blockTag: blockNumber
        })
        .then((res: any) => formatUnits(res, 30))

      const linkMaxPrice = await _gmxUnderlyingVault
        .getMaxPrice(link.address, {
          blockTag: blockNumber
        })
        .then((res: any) => formatUnits(res, 30))
      const linkMinPrice = await _gmxUnderlyingVault
        .getMinPrice(link.address, {
          blockTag: blockNumber
        })
        .then((res: any) => formatUnits(res, 30))

      const uniMaxPrice = await _gmxUnderlyingVault
        .getMaxPrice(uni.address, {
          blockTag: blockNumber
        })
        .then((res: any) => formatUnits(res, 30))
      const uniMinPrice = await _gmxUnderlyingVault
        .getMinPrice(uni.address, {
          blockTag: blockNumber
        })
        .then((res: any) => formatUnits(res, 30))

      const fsGlp_balanceOf_juniorVault = Number(
        formatEther(
          await fsGLP.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber
          })
        )
      )
      const fsGlp_balanceOf_batchingManager = Number(
        formatEther(
          await dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
            blockTag: blockNumber
          })
        )
      )

      // this is not used, but here for reference in output data
      const glp_totalSupply = Number(
        formatEther(
          await glp.totalSupply({
            blockTag: blockNumber
          })
        )
      )

      const vaultGlp = fsGlp_balanceOf_juniorVault + fsGlp_balanceOf_batchingManager

      const wethCurrentToken = (wethTokenWeight * vaultGlp * glpPrice) / wethMinPrice
      const wbtcCurrentToken = (wbtcTokenWeight * vaultGlp * glpPrice) / wbtcMinPrice
      const linkCurrentToken = (linkTokenWeight * vaultGlp * glpPrice) / linkMinPrice
      const uniCurrentToken = (uniTokenWeight * vaultGlp * glpPrice) / uniMinPrice

      return {
        blockNumber: blockNumber,
        eventName: event.event ?? 'unknown',
        timestamp: block.timestamp,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
        glp_totalSupply,
        vaultGlp,
        glpPrice,
        wethUsdgAmount,
        wbtcUsdgAmount,
        linkUsdgAmount,
        uniUsdgAmount,
        totalUsdcAmount,
        wethTokenWeight,
        wbtcTokenWeight,
        linkTokenWeight,
        uniTokenWeight,
        wethMaxPrice,
        wethMinPrice,
        wbtcMaxPrice,
        wbtcMinPrice,
        linkMaxPrice,
        linkMinPrice,
        uniMaxPrice,
        uniMinPrice,
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
      const ethPnl = last.wethCurrentToken * (current.wethMinPrice - last.wethMinPrice)
      const btcPnl = last.wbtcCurrentToken * (current.wbtcMinPrice - last.wbtcMinPrice)
      const uniPnl = last.uniCurrentToken * (current.uniMinPrice - last.uniMinPrice)
      const linkPnl = last.linkCurrentToken * (current.linkMinPrice - last.linkMinPrice)

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
