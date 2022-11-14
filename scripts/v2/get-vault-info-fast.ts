import { ethers } from "ethers";

import {
  Amount,
  bigNumberToAmount,
  getVault,
  IERC20Metadata__factory,
  NetworkName,
  stringifyBigNumber,
  VaultName,
} from "@ragetrade/sdk";

import { getProvider } from "../../providers";

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

  // vault market value
  const vaultMarketValueUSD = await vault.getVaultMarketValue();
  const vaultMarketValue = bigNumberToAmount(vaultMarketValueUSD, USD_DECIMALS);

  return {
    totalSupply,
    totalShares: totalSupply,
    totalAssets,
    vaultMarketValue,
  };
}
