import type { NetworkName } from '@ragetrade/sdk'
import { chainlink, tokens, gmxProtocol } from '@ragetrade/sdk'
import { ethers } from 'ethers'
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
  const provider = getProviderAggregate(networkName)
  const { weth, wbtc, usdc } = tokens.getContractsSync(networkName, provider)
  const link = wbtc.attach('0xf97f4df75117a78c1A5a0DBb814Af92458539FB4')
  const uni = wbtc.attach('0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0')
  const { ethUsdAggregator, btcUsdAggregator } = chainlink.getContractsSync(networkName)
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)
  const usdcUsdAggregator = ethUsdAggregator.attach(
    '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3'
  )

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

  switch (addr.toLowerCase()) {
    case weth.address.toLowerCase():
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
      return (wethMaxPrice + wethMinPrice) / 2
    case wbtc.address.toLowerCase():
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
      return (wbtcMaxPrice + wbtcMinPrice) / 2
    case usdc.address.toLowerCase():
      return usdcUsdAggregator
        .latestRoundData({
          blockTag: blockNumber
        })
        .then((res) => Number(formatUnits(res.answer)))

    case link.address.toLowerCase():
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
      return (linkMaxPrice + linkMinPrice) / 2
    case uni.address.toLowerCase():
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
      return (uniMaxPrice + uniMinPrice) / 2
    default:
      throw new Error('i dont know')
  }
}
