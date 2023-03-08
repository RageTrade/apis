import type { NetworkName, ResultWithMetadata } from '@ragetrade/sdk'
import { aave, deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk'
import type { TokenSwappedEvent } from '@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager'
import { fetchJson, formatEther, formatUnits } from 'ethers/lib/utils'

import { ENV } from '../../env'
import { getProviderAggregate } from '../../providers'
import { days, formatAsNum, timestampRoundDown } from '../../utils'
import type { GlobalTotalSharesResult } from './total-shares'
import { intersection } from './util/combine'
import { juniorVault } from './util/events'
import { ShortsTracker__factory } from './util/events/gmx-vault/contracts'
import { decimals, name, price } from './util/helpers'
import { parallelize } from './util/parallelize'
import type { Entry } from './util/types'

export type GlobalDeltaSpreadEntry = Entry<{
  timestamp: number

  uniswapVolume: number
  uniswapSlippage: number

  btcBought: number
  ethBought: number
  btcSold: number
  ethSold: number
  btcBoughtSlippage: number
  ethBoughtSlippage: number
  btcSoldSlippage: number
  ethSoldSlippage: number

  btcHedgeDeltaPnl: number
  ethHedgeDeltaPnl: number

  btcPrice: number
  ethPrice: number
  btcAmountAfter: number
  ethAmountAfter: number
  btcPoolAmount: number
  ethPoolAmount: number

  ethCurrentToken: number
  btcCurrentToken: number

  fsGlp_balanceOf_juniorVault: number
  fsGlp_balanceOf_batchingManager: number
  glp_totalSupply: number
}>

export interface GlobalDeltaSpreadDailyEntry {
  startTimestamp: number
  endTimestamp: number
  uniswapSlippageNet: number
  uniswapVolumeNet: number
  btcHedgeDeltaPnlNet: number
  ethHedgeDeltaPnlNet: number
}

export interface GlobalDeltaSpreadResult {
  data: GlobalDeltaSpreadEntry[]
  dailyData: GlobalDeltaSpreadDailyEntry[]

  dataLength: number

  totalUniswapVolume: number
  totalUniswapSlippage: number

  totalBtcBought: number
  totalEthBought: number
  totalBtcSold: number
  totalEthSold: number
  totalBtcBoughtSlippage: number
  totalEthBoughtSlippage: number
  totalBtcSoldSlippage: number
  totalEthSoldSlippage: number

  totalBtcHedgeDeltaPnl: number
  totalEthHedgeDeltaPnl: number
}

export async function getDeltaSpread(
  networkName: NetworkName,
  excludeRawData: boolean
): Promise<GlobalDeltaSpreadResult> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-delta-spread?networkName=${networkName}`,
      timeout: 1_000_000_000 // huge number
    })
    delete resp.result.data
    return resp.result
  }

  const provider = getProviderAggregate(networkName)

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider)
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)
  const { wbtc, weth, fsGLP, glp } = tokens.getContractsSync(networkName, provider)
  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName)
  const { aUsdc } = aave.getContractsSync(networkName, provider)
  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress)
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress)

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> = await fetchJson({
    url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
    timeout: 1_000_000_000 // huge number
  })

  const shortTracker = ShortsTracker__factory.connect(
    '0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da',
    provider
  )

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [juniorVault.deposit, juniorVault.withdraw, juniorVault.rebalanced],
      startBlockNumber: ENV.START_BLOCK_NUMBER
    },
    async (_i, blockNumber, event) => {
      const rc = await provider.getTransactionReceipt(event.transactionHash)
      const filter = dnGmxJuniorVault.filters.TokenSwapped()
      const parsed = rc.logs
        .filter((log) => log.topics[0] === filter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as TokenSwappedEvent[]

      let uniswapVolume = 0
      let uniswapSlippage = 0

      let btcBought = 0
      let ethBought = 0
      let btcSold = 0
      let ethSold = 0
      let btcBoughtSlippage = 0
      let ethBoughtSlippage = 0
      let btcSoldSlippage = 0
      let ethSoldSlippage = 0

      const btcPrice: number = await price(wbtc.address, blockNumber, networkName)
      const ethPrice: number = await price(weth.address, blockNumber, networkName)

      for (const event of parsed) {
        const fromPrice = await price(event.args.fromToken, blockNumber, networkName)
        const toPrice = await price(event.args.toToken, blockNumber, networkName)

        const fromQuantity = Number(
          formatUnits(
            event.args.fromQuantity,
            decimals(event.args.fromToken, networkName)
          )
        )
        const toQuantity = Number(
          formatUnits(event.args.toQuantity, decimals(event.args.toToken, networkName))
        )

        const fromDollar = fromPrice * fromQuantity
        const toDollar = toPrice * toQuantity
        const slippageDollar = toDollar - fromDollar
        //   vaultSumSlippageDollar += slippageDollar;

        if (name(event.args.fromToken, networkName) === 'wbtc') {
          btcSold += fromDollar
          btcSoldSlippage += slippageDollar
        }
        if (name(event.args.fromToken, networkName) === 'weth') {
          ethSold += fromDollar
          ethSoldSlippage += slippageDollar
        }
        if (name(event.args.toToken, networkName) === 'wbtc') {
          btcBought += toDollar
          btcBoughtSlippage += slippageDollar
        }
        if (name(event.args.toToken, networkName) === 'weth') {
          ethBought += toDollar
          ethBoughtSlippage += slippageDollar
        }
        uniswapVolume += fromDollar
        uniswapSlippage += slippageDollar
      }

      const _btcAmountAfter = await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber
      })
      const btcAmountAfter = Number(formatUnits(_btcAmountAfter, 8))

      const _ethAmountAfter = await vdWeth.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber
      })
      const ethAmountAfter = Number(formatUnits(_ethAmountAfter, 18))

      const _btcPoolAmount = await gmxUnderlyingVault.poolAmounts(wbtc.address, {
        blockTag: blockNumber
      })
      const btcPoolAmount = Number(formatEther(_btcPoolAmount))

      const _ethPoolAmount = await gmxUnderlyingVault.poolAmounts(weth.address, {
        blockTag: blockNumber
      })
      const ethPoolAmount = Number(formatEther(_ethPoolAmount))

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

      // (poolAmount - reserveAmount) + (shortSize / averagePrice)
      const ethTokenWeight =
        ethPoolAmount - wethReservedAmounts + wethShortSizes / wethShortAveragePrice

      const btcTokenWeight =
        btcPoolAmount - wbtcReservedAmounts + wbtcShortSizes / wbtcShortAveragePrice

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
      const glp_totalSupply = Number(
        formatEther(
          await glp.totalSupply({
            blockTag: blockNumber
          })
        )
      )
      const vaultGlp = fsGlp_balanceOf_juniorVault + fsGlp_balanceOf_batchingManager

      const ethCurrentToken = (ethTokenWeight * vaultGlp) / glp_totalSupply
      const btcCurrentToken = (btcTokenWeight * vaultGlp) / glp_totalSupply

      // TODO export price and then do the "last" kind of loop after this
      return {
        blockNumber,
        eventName: event.event ?? 'unknown',
        transactionHash: event.transactionHash,
        uniswapVolume,
        uniswapSlippage,

        btcBought,
        ethBought,
        btcSold,
        ethSold,
        btcBoughtSlippage,
        ethBoughtSlippage,
        btcSoldSlippage,
        ethSoldSlippage,

        btcPrice,
        ethPrice,
        btcAmountAfter,
        ethAmountAfter,
        btcPoolAmount,
        ethPoolAmount,
        ethCurrentToken,
        btcCurrentToken,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
        glp_totalSupply
      }
    }
  )

  const dataWithTimestamp = intersection(data, totalSharesData.result.data, (a, b) => ({
    ...a,
    timestamp: b.timestamp
  }))

  const extraData: Entry<{
    btcHedgeDeltaPnl: number
    ethHedgeDeltaPnl: number
  }>[] = []

  let last
  for (const current of dataWithTimestamp) {
    if (last) {
      const priceDiffEth = current.ethPrice - last.ethPrice
      const priceDiffBtc = current.btcPrice - last.btcPrice

      const btcHedgeDeltaPnl = last.ethCurrentToken * priceDiffEth
      const ethHedgeDeltaPnl = last.btcCurrentToken * priceDiffBtc

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        btcHedgeDeltaPnl,
        ethHedgeDeltaPnl
      })
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        btcHedgeDeltaPnl: 0,
        ethHedgeDeltaPnl: 0
      })
    }
    last = current
  }

  const combinedData = intersection(dataWithTimestamp, extraData, (a, b) => ({
    ...a,
    ...b
  }))

  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalDeltaSpreadDailyEntry[], cur: GlobalDeltaSpreadEntry) => {
        let lastEntry = acc[acc.length - 1]
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.uniswapSlippageNet += cur.uniswapSlippage
          lastEntry.uniswapVolumeNet += cur.uniswapVolume
          lastEntry.btcHedgeDeltaPnlNet += cur.btcHedgeDeltaPnl
          lastEntry.ethHedgeDeltaPnlNet += cur.ethHedgeDeltaPnl
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days < timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              uniswapSlippageNet: 0,
              uniswapVolumeNet: 0,
              btcHedgeDeltaPnlNet: 0,
              ethHedgeDeltaPnlNet: 0
            })
            lastEntry = acc[acc.length - 1]
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            uniswapSlippageNet: cur.uniswapSlippage,
            uniswapVolumeNet: cur.uniswapVolume,
            btcHedgeDeltaPnlNet: cur.btcHedgeDeltaPnl,
            ethHedgeDeltaPnlNet: cur.ethHedgeDeltaPnl
          })
        }
        return acc
      },
      []
    ),
    dataLength: data.length,
    totalUniswapVolume: combinedData.reduce((acc, cur) => acc + cur.uniswapVolume, 0),
    totalUniswapSlippage: combinedData.reduce((acc, cur) => acc + cur.uniswapSlippage, 0),
    totalBtcBought: combinedData.reduce((acc, cur) => acc + cur.btcBought, 0),
    totalEthBought: combinedData.reduce((acc, cur) => acc + cur.ethBought, 0),
    totalBtcSold: combinedData.reduce((acc, cur) => acc + cur.btcSold, 0),
    totalEthSold: combinedData.reduce((acc, cur) => acc + cur.ethSold, 0),
    totalBtcBoughtSlippage: data.reduce((acc, cur) => acc + cur.btcBoughtSlippage, 0),
    totalEthBoughtSlippage: combinedData.reduce(
      (acc, cur) => acc + cur.ethBoughtSlippage,
      0
    ),
    totalBtcSoldSlippage: combinedData.reduce((acc, cur) => acc + cur.btcSoldSlippage, 0),
    totalEthSoldSlippage: combinedData.reduce((acc, cur) => acc + cur.ethSoldSlippage, 0),
    totalBtcHedgeDeltaPnl: combinedData.reduce(
      (acc, cur) => acc + cur.btcHedgeDeltaPnl,
      0
    ),
    totalEthHedgeDeltaPnl: combinedData.reduce(
      (acc, cur) => acc + cur.ethHedgeDeltaPnl,
      0
    )
  }
}
