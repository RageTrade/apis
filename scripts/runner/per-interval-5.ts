import type { NetworkName } from '@ragetrade/sdk'
import { gmxProtocol, tokens } from '@ragetrade/sdk'
import type { ethers } from 'ethers'
import { BigNumber } from 'ethers'
import { formatEther, formatUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { price } from '../aggregated/util/helpers'
import { parallelize } from '../aggregated/util/parallelize'

export async function perInterval2(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName)

  const { gmxUnderlyingVault, glpManager } = gmxProtocol.getContractsSync(
    networkName,
    provider
  )
  const allWhitelistedTokensLength = (
    await gmxUnderlyingVault.allWhitelistedTokensLength()
  ).toNumber()
  const allWhitelistedTokens: string[] = []
  for (let i = 0; i < allWhitelistedTokensLength; i++) {
    allWhitelistedTokens.push(await gmxUnderlyingVault.allWhitelistedTokens(i))
  }
  const { weth, wbtc, fsGLP, glp } = tokens.getContractsSync(networkName, provider)

  // LINK / USD: https://arbiscan.io/address/0x86E53CF1B870786351Da77A57575e79CB55812CB
  // UNI / USD: https://arbiscan.io/address/0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720
  const link = wbtc.attach('0xf97f4df75117a78c1A5a0DBb814Af92458539FB4')
  const uni = wbtc.attach('0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0')

  // const startBlock = 27679448; // Oct 1
  // const endBlock = 50084140; // Dec 31
  // const startBlock = 50084140; // Oct 1
  // const endBlock = await provider.getBlockNumber();
  // const interval = 2000; // 497; // Math.floor(((endBlock - startBlock) * 3 * mins) / days);

  // LeadDev — Today at 7:36 AM
  // 7:36

  const startBlock = 50084140
  const endBlock = 51518140
  const interval = 600

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: () => {
        const events = []
        for (let i = startBlock; i <= endBlock; i += interval) {
          events.push({
            blockNumber: i
          })
        }
        return events as ethers.Event[]
      },
      ignoreMoreEventsInSameBlock: true
    },
    async (_i, blockNumber) => {
      const block = await provider.getBlock(blockNumber)

      const wethPoolAmount = Number(
        formatEther(
          await gmxUnderlyingVault.poolAmounts(weth.address, {
            blockTag: blockNumber
          })
        )
      )
      const wbtcPoolAmount = Number(
        formatUnits(
          await gmxUnderlyingVault.poolAmounts(wbtc.address, {
            blockTag: blockNumber
          }),
          8
        )
      )
      const linkPoolAmount = Number(
        formatEther(
          await gmxUnderlyingVault.poolAmounts(link.address, {
            blockTag: blockNumber
          })
        )
      )
      const uniPoolAmount = Number(
        formatEther(
          await gmxUnderlyingVault.poolAmounts(uni.address, {
            blockTag: blockNumber
          })
        )
      )

      const wethGlobalShortAveragePrices = Number(
        formatUnits(
          await gmxUnderlyingVault.globalShortAveragePrices(weth.address, {
            blockTag: blockNumber
          }),
          30
        )
      )
      const wbtcGlobalShortAveragePrices = Number(
        formatUnits(
          await gmxUnderlyingVault.globalShortAveragePrices(wbtc.address, {
            blockTag: blockNumber
          }),
          30
        )
      )
      const wethglobalShortSizes = Number(
        formatUnits(
          await gmxUnderlyingVault.globalShortSizes(weth.address, {
            blockTag: blockNumber
          }),
          30
        )
      )
      const wbtcglobalShortSizes = Number(
        formatUnits(
          await gmxUnderlyingVault.globalShortSizes(wbtc.address, {
            blockTag: blockNumber
          }),
          30
        )
      )

      const wethReserveAmount = Number(
        formatEther(
          await gmxUnderlyingVault.reservedAmounts(weth.address, {
            blockTag: blockNumber
          })
        )
      )
      const wbtcReserveAmount = Number(
        formatUnits(
          await gmxUnderlyingVault.reservedAmounts(wbtc.address, {
            blockTag: blockNumber
          }),
          8
        )
      )

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

      let glpPrice = 0
      try {
        const aum = Number(
          formatUnits(await glpManager.getAum(false, { blockTag: blockNumber }), 30)
        )
        const glp_totalSupply = Number(
          formatEther(
            await glp.totalSupply({
              blockTag: blockNumber
            })
          )
        )
        glpPrice = glp_totalSupply > 0 ? aum / glp_totalSupply : 0
      } catch {}
      // const glpPrice = Number(
      //   formatEther(
      //     await dnGmxJuniorVault.getPrice(false, {
      //       blockTag: blockNumber,
      //     })
      //   )
      // );

      const wethPrice = await price(weth.address, blockNumber, networkName)
      const wbtcPrice = await price(wbtc.address, blockNumber, networkName)
      const linkPrice = await price(link.address, blockNumber, networkName)
      const uniPrice = await price(uni.address, blockNumber, networkName)

      const wethGuaranteedUsd = Number(
        formatUnits(
          await gmxUnderlyingVault.guaranteedUsd(weth.address, {
            blockTag: blockNumber
          }),
          30
        )
      )
      const wbtcGuaranteedUsd = Number(
        formatUnits(
          await gmxUnderlyingVault.guaranteedUsd(wbtc.address, {
            blockTag: blockNumber
          }),
          30
        )
      )

      const fsGlp_totalSupply = Number(
        formatEther(
          await fsGLP.totalSupply({
            blockTag: blockNumber
          })
        )
      )

      return {
        blockNumber,
        timestamp: block.timestamp,

        wethPoolAmount,
        wbtcPoolAmount,
        linkPoolAmount,
        uniPoolAmount,

        wethGlobalShortAveragePrices,
        wbtcGlobalShortAveragePrices,
        wethglobalShortSizes,
        wbtcglobalShortSizes,

        wethReserveAmount,
        wbtcReserveAmount,

        wethUsdgAmount,
        wbtcUsdgAmount,
        linkUsdgAmount,
        uniUsdgAmount,
        totalUsdcAmount,

        wethPrice,
        wbtcPrice,
        linkPrice,
        uniPrice,
        glpPrice,

        wethGuaranteedUsd,
        wbtcGuaranteedUsd,

        fsGlp_totalSupply
      }
    }
  )

  return data
}
