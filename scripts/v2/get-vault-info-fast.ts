import { BigNumber, ethers } from "ethers";

import {
  Amount,
  bigNumberToAmount,
  DnGmxJuniorVault__factory,
  getVault,
  IERC20Metadata__factory,
  NetworkName,
  priceX128ToPrice,
  Q128,
  stringifyBigNumber,
  stringToAmount,
  VaultName,
} from "@ragetrade/sdk";

import { getProvider } from "../../providers";
import { parseUnits } from "ethers/lib/utils";

export async function getVaultInfoFast(
  networkName: NetworkName,
  vaultName: VaultName
) {
  const provider = getProvider(networkName);
  const result = await getVaultInfoFastSDK(provider, vaultName);
  return stringifyBigNumber(result);
}

export interface VaultInfoFastResult {
  totalSupply: Amount;
  totalShares: Amount;
  totalAssets: Amount;
  vaultMarketValue: Amount;
  assetsPerShare: Amount;
  assetPrice: Amount;
  sharePrice: Amount;
}
const USD_DECIMALS = 6;

export async function getVaultInfoFastSDK(
  provider: ethers.providers.Provider,
  vaultName: VaultName
): Promise<VaultInfoFastResult> {
  const { vault } = await getVault(provider, vaultName);

  const shareDecimals = await vault.decimals();
  const assetDecimals = await IERC20Metadata__factory.connect(
    await vault.asset(),
    provider
  ).decimals();

  // total supply, total assets
  const totalSupply = bigNumberToAmount(
    await vault.totalSupply(),
    shareDecimals
  );
  const totalAssets = bigNumberToAmount(
    await vault.totalAssets(),
    assetDecimals
  );

  // asset price
  let assetPrice: Amount;
  let assetPriceX128: BigNumber;
  try {
    assetPriceX128 = await vault.getPriceX128(); // dollars per asset
    assetPrice = stringToAmount(
      (
        await priceX128ToPrice(assetPriceX128, USD_DECIMALS, assetDecimals)
      ).toFixed(USD_DECIMALS),
      USD_DECIMALS
    );
  } catch {
    const priceD18 = await DnGmxJuniorVault__factory.connect(
      vault.address,
      provider
    ).getPrice(false);
    assetPrice = bigNumberToAmount(priceD18, 18);
    assetPriceX128 = priceD18.mul(Q128).div(BigNumber.from(10).pow(18 + 12));
  }

  // share price
  const assetsPerShareDX = await vault.convertToAssets(
    parseUnits("1", shareDecimals)
  );
  const assetsPerShare = bigNumberToAmount(assetsPerShareDX, assetDecimals);
  const sharePrice = stringToAmount(
    (
      await priceX128ToPrice(
        assetPriceX128
          .mul(assetsPerShareDX)
          .div(parseUnits("1", assetDecimals)),
        6,
        shareDecimals
      )
    ).toFixed(USD_DECIMALS),
    USD_DECIMALS
  );

  // vault market value
  const vaultMarketValueUSD = await vault.getVaultMarketValue();
  const vaultMarketValue = bigNumberToAmount(vaultMarketValueUSD, USD_DECIMALS);

  return {
    totalSupply,
    totalShares: totalSupply,
    totalAssets,
    vaultMarketValue,
    assetsPerShare,
    assetPrice,
    sharePrice,
  };
}
