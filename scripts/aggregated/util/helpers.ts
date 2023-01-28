import type { NetworkName } from '@ragetrade/sdk'
import { chainlink, tokens } from '@ragetrade/sdk'
import type { ethers } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../../providers'

export function name(addr: string, networkName: NetworkName) {
  const { weth, wbtc, usdc } = tokens.getContractsSync(networkName)
  switch (addr.toLowerCase()) {
    case weth.address.toLowerCase():
      return 'weth'
    case wbtc.address.toLowerCase():
      return 'wbtc'
    case usdc.address.toLowerCase():
      return 'usdc'
    default:
      return addr
  }
}

export function decimals(addr: string, networkName: NetworkName) {
  const { weth, wbtc, usdc } = tokens.getContractsSync(networkName)
  switch (addr.toLowerCase()) {
    case weth.address.toLowerCase():
      return 18
    case wbtc.address.toLowerCase():
      return 8
    case usdc.address.toLowerCase():
      return 6
    default:
      return 18
  }
}

export async function price(addr: string, blockNumber: number, networkName: NetworkName) {
  const { weth, wbtc, usdc } = tokens.getContractsSync(
    networkName,
    getProviderAggregate(networkName)
  )
  const link = wbtc.attach('0xf97f4df75117a78c1A5a0DBb814Af92458539FB4')
  const uni = wbtc.attach('0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0')
  const { ethUsdAggregator, btcUsdAggregator } = chainlink.getContractsSync(
    networkName,
    getProviderAggregate(networkName)
  )
  const usdcUsdAggregator = ethUsdAggregator.attach(
    '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3'
  )
  const linkUsdAggregator = ethUsdAggregator.attach(
    '0x86E53CF1B870786351Da77A57575e79CB55812CB'
  )
  const uniUsdAggregator = ethUsdAggregator.attach(
    '0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720'
  )

  switch (addr.toLowerCase()) {
    case weth.address.toLowerCase():
      return Number(
        formatUnits(
          (
            await ethUsdAggregator.latestRoundData({
              blockTag: blockNumber
            })
          ).answer,
          8
        )
      )
    case wbtc.address.toLowerCase():
      return Number(
        formatUnits(
          (
            await btcUsdAggregator.latestRoundData({
              blockTag: blockNumber
            })
          ).answer,
          8
        )
      )
    case usdc.address.toLowerCase():
      return Number(
        formatUnits(
          (
            await usdcUsdAggregator.latestRoundData({
              blockTag: blockNumber
            })
          ).answer,
          8
        )
      )

    case link.address.toLowerCase():
      return Number(
        formatUnits(
          (
            await linkUsdAggregator.latestRoundData({
              blockTag: blockNumber
            })
          ).answer,
          8
        )
      )
    case uni.address.toLowerCase():
      return Number(
        formatUnits(
          (
            await uniUsdAggregator.latestRoundData({
              blockTag: blockNumber
            })
          ).answer,
          8
        )
      )
    default:
      throw new Error('i dont know')
  }
}

export async function getLogsInLoop(
  contract: ethers.Contract,
  event: ethers.EventFilter,
  fromBlock: number,
  toBlock: number,
  intervalBlocks: number
): Promise<ethers.Event[]> {
  const logs: ethers.Event[] = []
  for (let i = fromBlock; i < toBlock; i += intervalBlocks) {
    const _logs = await contract.queryFilter(
      event,
      i,
      Math.min(toBlock, i + intervalBlocks - 1)
    )
    logs.push(..._logs)
  }
  return logs
}
