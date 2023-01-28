import type { Amount, NetworkName, VaultName } from '@ragetrade/sdk'
import {
  bigNumberToAmount,
  deltaNeutralGmxVaults,
  DnGmxJuniorVault__factory,
  getVault,
  IERC20Metadata__factory,
  priceX128ToPrice,
  Q128,
  stringifyBigNumber,
  stringToAmount,
  tokens
} from '@ragetrade/sdk'
import type { ethers } from 'ethers'
import { BigNumber } from 'ethers'
import { parseUnits } from 'ethers/lib/utils'

import { getProvider } from '../../providers'

export async function getVaultInfoFast(networkName: NetworkName, vaultName: VaultName) {
  const provider = getProvider(networkName)
  const result = await getVaultInfoFastSDK(provider, vaultName)
  return stringifyBigNumber(result)
}

export interface VaultInfoFastResult {
  totalSupply: Amount
  totalShares: Amount
  totalAssets: Amount
  vaultMarketValue: Amount
  vaultMarketValuePending: Amount
  assetsPerShare: Amount
  assetPrice: Amount
  sharePrice: Amount
}
const USD_DECIMALS = 6

export async function getVaultInfoFastSDK(
  provider: ethers.providers.Provider,
  vaultName: VaultName
): Promise<VaultInfoFastResult> {
  const { vault } = await getVault(provider, vaultName)

  const [
    vault_decimals,
    vault_asset,
    vault_totalSupply,
    vault_totalAssets,
    vault_getVaultMarketValue
  ] = await Promise.all([
    vault.decimals(),
    vault.asset(),
    vault.totalSupply(),
    vault.totalAssets(),
    vault.getVaultMarketValue()
  ])

  const shareDecimals = await vault_decimals
  const assetDecimals = await IERC20Metadata__factory.connect(
    vault_asset,
    provider
  ).decimals()

  // total supply, total assets
  const totalSupply = bigNumberToAmount(vault_totalSupply, shareDecimals)
  const totalAssets = bigNumberToAmount(vault_totalAssets, assetDecimals)

  // asset price
  let assetPrice: Amount
  let assetPriceX128: BigNumber
  try {
    assetPriceX128 = await vault.getPriceX128() // dollars per asset
    assetPrice = stringToAmount(
      (await priceX128ToPrice(assetPriceX128, USD_DECIMALS, assetDecimals)).toFixed(
        USD_DECIMALS
      ),
      USD_DECIMALS
    )
  } catch {
    const priceD18 = await DnGmxJuniorVault__factory.connect(
      vault.address,
      provider
    ).getPrice(false)
    assetPrice = bigNumberToAmount(priceD18, 18)
    assetPriceX128 = priceD18.mul(Q128).div(BigNumber.from(10).pow(18 + 12))
  }

  // share price
  const assetsPerShareDX = await vault.convertToAssets(parseUnits('1', shareDecimals))
  const assetsPerShare = bigNumberToAmount(assetsPerShareDX, assetDecimals)
  const sharePrice = stringToAmount(
    (
      await priceX128ToPrice(
        assetPriceX128.mul(assetsPerShareDX).div(parseUnits('1', assetDecimals)),
        6,
        shareDecimals
      )
    ).toFixed(USD_DECIMALS),
    USD_DECIMALS
  )

  // vault market value
  const vaultMarketValueUSD = vault_getVaultMarketValue
  const vaultMarketValue = bigNumberToAmount(vaultMarketValueUSD, USD_DECIMALS)

  // vault market value pending
  let vaultMarketValuePending = stringToAmount('0', USD_DECIMALS)
  if (vaultName === 'dn_gmx_junior') {
    const { usdc, fsGLP } = await tokens.getContracts(provider)
    const { dnGmxBatchingManager } = await deltaNeutralGmxVaults.getContracts(provider)

    const [usdcBalance, sglpBalance, sglpBalanceOfJuniorVault] = await Promise.all([
      usdc.balanceOf(dnGmxBatchingManager.address),
      fsGLP.balanceOf(dnGmxBatchingManager.address),
      dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance()
    ])

    const sglpInDollars = sglpBalance
      .sub(sglpBalanceOfJuniorVault)
      .mul(assetPriceX128)
      .div(Q128)

    vaultMarketValuePending = bigNumberToAmount(usdcBalance.add(sglpInDollars), 6)
  }

  return {
    totalSupply,
    totalShares: totalSupply,
    totalAssets,
    vaultMarketValue,
    vaultMarketValuePending,
    assetsPerShare,
    assetPrice,
    sharePrice
  }
}
