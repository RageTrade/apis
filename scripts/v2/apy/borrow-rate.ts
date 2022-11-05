import 'isomorphic-unfetch';
import { typechain } from '@ragetrade/sdk'
import { NetworkName } from "@ragetrade/sdk";
import { getProvider } from "../../../providers";
import { formatUnits } from 'ethers/lib/utils';
import { deltaNeutralGmxVaults } from '@ragetrade/sdk';

const idWeth = "42161-0x82af49447d8a07e3bd95bd0d56f35241523fbab1-0xa97684ead0e402dc232d5a977953df7ecbab3cdb"
const idWbtc = "42161-0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f-0xa97684ead0e402dc232d5a977953df7ecbab3cdb"

const dataUrl = 'https://aave-api-v2.aave.com/data/markets-data'

export const getBorrowApy = async (networkName: NetworkName) => {
  const provider = getProvider(networkName);

  const dn = await deltaNeutralGmxVaults.getContracts(provider)

  const vdWbtc = typechain.core.ERC20__factory.connect(networkName == 'arbmain' ? '0x92b42c66840C7AD907b4BF74879FF3eF7c529473' : '0x3bf376701600ACAF865EBdf902Ef3b322BB433aE', provider)
  const vdWeth = typechain.core.ERC20__factory.connect(networkName == 'arbmain' ? '0x0c84331e39d6658Cd6e6b9ba04736cC4c4734351' : '0xf69Ff61eE59Cd1Fd191B094C957938C7Dd0F8c3c', provider)

  const response = (await (await fetch(dataUrl)).json()).reserves

  const btcBorrowBase = Number(response.find((o:any) => o.id === idWbtc).variableBorrowRate)
  const ethBorrowBase = Number(response.find((o:any) => o.id === idWeth).variableBorrowRate)

  const btcPrice = networkName == 'arbmain' ? (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')).json()).bitcoin.usd : 60_000
  const ethPrice = networkName == 'arbmain' ? (await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')).json()).ethereum.usd : 4_000

  const btcQuantity = Number(formatUnits(await vdWbtc.balanceOf(dn.dnGmxJuniorVault.address), 8))
  const ethQuantity = Number(formatUnits(await vdWeth.balanceOf(dn.dnGmxJuniorVault.address), 18))

  const vmv = Number(formatUnits(await dn.dnGmxJuniorVault.getVaultMarketValue(), 6))

  const btcBorrowApy = vmv > 0 ? btcBorrowBase * btcPrice * btcQuantity / vmv : 0
  const ethBorrowApy = vmv > 0 ? ethBorrowBase * ethPrice * ethQuantity / vmv : 0

  return [btcBorrowApy * -1 * 100, ethBorrowApy * -1 * 100]
}