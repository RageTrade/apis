import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, gmxProtocol, tokens } from '@ragetrade/sdk'
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
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  )

  const { weth, wbtc, fsGLP, glp } = tokens.getContractsSync(networkName, provider)

  // LINK / USD: https://arbiscan.io/address/0x86E53CF1B870786351Da77A57575e79CB55812CB
  // UNI / USD: https://arbiscan.io/address/0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720
  const link = wbtc.attach('0xf97f4df75117a78c1A5a0DBb814Af92458539FB4')
  const uni = wbtc.attach('0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0')
  const shortsTrackerAddress = '0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da'

  const startBlock = 55870561
  const endBlock = await provider.getBlockNumber()
  const interval = 600

  const jones = dnGmxJuniorVault.attach('0x17ff154a329e37282eb9a76c3ae848fc277f24c7')

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
      try {
        const totalSupply = Number(
          formatEther(
            await jones.totalSupply({
              blockTag: blockNumber
            })
          )
        )
        const totalAssets = Number(
          formatEther(
            await jones.totalAssets({
              blockTag: blockNumber
            })
          )
        )

        return {
          blockNumber,
          timestamp: block.timestamp,

          glpPrice,
          totalSupply,
          totalAssets
        }
      } catch {
        return null
      }
    }
  )

  return data
}
