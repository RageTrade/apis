import 'isomorphic-unfetch'

import { aave, chainlink, NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, typechain } from '@ragetrade/sdk'
import { formatUnits } from 'ethers/lib/utils'

import { getProvider } from '../../../providers'
import { fetchJsonRetry, fetchRetry } from '../../../utils'

const idWeth =
  '42161-0x82af49447d8a07e3bd95bd0d56f35241523fbab1-0xa97684ead0e402dc232d5a977953df7ecbab3cdb'
const idWbtc =
  '42161-0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f-0xa97684ead0e402dc232d5a977953df7ecbab3cdb'

const dataUrl = 'https://aave-api-v2.aave.com/data/markets-data'

const getBtcPrice = async (networkName: NetworkName) => {
  const { btcUsdAggregator } = chainlink.getContractsSync(networkName)
  const { answer } = await btcUsdAggregator.latestRoundData()
  return Number(formatUnits(answer, 8))
}

const getETHPrice = async (networkName: NetworkName) => {
  const { ethUsdAggregator } = chainlink.getContractsSync(networkName)
  const { answer } = await ethUsdAggregator.latestRoundData()
  return Number(formatUnits(answer, 8))
}

export const getBorrowApy = async (networkName: NetworkName) => {
  const provider = getProvider(networkName)

  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName)

  const vdWbtc = typechain.core.ERC20__factory.connect(
    wbtcVariableDebtTokenAddress,
    provider
  )
  const vdWeth = typechain.core.ERC20__factory.connect(
    wethVariableDebtTokenAddress,
    provider
  )

  const [dn, btcPrice, ethPrice, aaveResponse] = await Promise.all([
    deltaNeutralGmxVaults.getContracts(provider),
    getBtcPrice(networkName),
    getETHPrice(networkName),
    fetchRetry(dataUrl)
  ])

  const [aaveResponseJson, _btcQuantity, _ethQuantity, _vmv] = await Promise.all([
    aaveResponse.json(),
    vdWbtc.balanceOf(dn.dnGmxJuniorVault.address),
    vdWeth.balanceOf(dn.dnGmxJuniorVault.address),
    dn.dnGmxJuniorVault.getVaultMarketValue()
  ])

  const aaveReserves = aaveResponseJson.reserves

  const btcBorrowBase = Number(
    aaveReserves.find((o: any) => o.id === idWbtc).variableBorrowRate
  )
  const ethBorrowBase = Number(
    aaveReserves.find((o: any) => o.id === idWeth).variableBorrowRate
  )

  const btcQuantity = Number(formatUnits(_btcQuantity, 8))
  const ethQuantity = Number(formatUnits(_ethQuantity, 18))
  const vmv = Number(formatUnits(_vmv, 6))

  const btcBorrowApy = vmv > 0 ? (btcBorrowBase * btcPrice * btcQuantity) / vmv : 0
  const ethBorrowApy = vmv > 0 ? (ethBorrowBase * ethPrice * ethQuantity) / vmv : 0

  return [btcBorrowApy * -1 * 100, ethBorrowApy * -1 * 100]
}
