import {
  NetworkName,
  formatUsdc,
  priceX128ToPrice,
  getVaultContracts,
} from "@ragetrade/sdk";
import { vaults } from "@ragetrade/sdk";
import { ethers, BigNumber } from "ethers";
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils";
import { getProvider } from "../providers";
import { VaultName } from "../utils";

export async function getVaultInfo(
  networkName: NetworkName,
  vaultName: VaultName
) {
  const provider = getProvider(networkName);
  return await _getVaultInfo(provider, vaultName);
}

export async function _getVaultInfo(
  provider: ethers.providers.Provider,
  vaultName: VaultName
): Promise<{
  totalSupply: number;
  totalShares: number;
  totalAssets: number;
  assetPrice: number;
  sharePrice: number;
  depositCap: number;
  vaultMarketValue: number;

  totalSupplyD18: string;
  totalSharesD18: string;
  totalAssetsD18: string;
  assetPriceD18: string;
  sharePriceD18: string;
  depositCapD18: string;
  vaultMarketValueD6: string;
}> {
  let vaultAddress = "";
  // TODO move switch to getParam
  switch (vaultName) {
    case "tricrypto":
      const { curveYieldStrategy } = await getVaultContracts(provider);
      vaultAddress = curveYieldStrategy.address;
      break;
    case "gmx":
      //   const { gmxYieldStrategy } = await getGmxVaultContracts(provider);
      //   vaultAddress = gmxYieldStrategy.address;
      throw new Error("gmx not implemented");
      break;
    default:
      throw new Error(`vaultName should be either tricrypto or gmx`);
  }

  const vault = vaults.BaseVault__factory.connect(vaultAddress, provider);

  const totalSupplyD18 = await vault.totalSupply();
  const totalAssetsD18 = await vault.totalAssets();
  const assetPriceX128 = await vault.getPriceX128(); // dollars per asset
  const assetsPerShareD18 = await vault.convertToAssets(parseEther("1"));
  const depositCapD18 = await vault.depositCap();
  const vaultMarketValueD6 = await vault.getVaultMarketValue();

  // formatting
  const totalSupply = Number(formatEther(totalSupplyD18));
  const totalAssets = Number(formatEther(totalAssetsD18));
  const assetPrice = Number(
    (await priceX128ToPrice(assetPriceX128, 6, 18)).toFixed(8)
  );
  const sharePrice = Number(
    (
      await priceX128ToPrice(
        assetPriceX128.mul(assetsPerShareD18).div(parseEther("1")),
        6,
        18
      )
    ).toFixed(8)
  );
  const depositCap = Number(formatEther(depositCapD18));
  const vaultMarketValue = Number(formatUsdc(vaultMarketValueD6));
  return {
    totalSupply,
    totalShares: totalSupply,
    totalAssets,
    assetPrice,
    sharePrice,
    depositCap,
    vaultMarketValue,

    totalSupplyD18: totalSupplyD18.toString(),
    totalSharesD18: totalSupplyD18.toString(),
    totalAssetsD18: totalAssetsD18.toString(),
    assetPriceD18: parseUnits(String(assetPrice), 18).toString(),
    sharePriceD18: parseUnits(String(sharePrice), 18).toString(),
    depositCapD18: depositCapD18.toString(),
    vaultMarketValueD6: vaultMarketValueD6.toString(),
  };
}
