import {
  NetworkName,
  formatUsdc,
  priceX128ToPrice,
  getCoreContracts,
  getTricryptoVaultContracts,
  truncate,
  Q128,
  getGmxVaultContracts,
  BaseVault__factory,
  getNetworkNameFromProvider,
} from "@ragetrade/sdk";
import { vaults } from "@ragetrade/sdk";
import { BaseVault } from "@ragetrade/sdk/dist/typechain/vaults";
import { BigNumber, ethers } from "ethers";
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils";
import { getProvider } from "../providers";
import { safeDiv, VaultName } from "../utils";
import { getBlockByTimestamp } from "./get-block-by-timestamp";

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
  poolComposition: {
    rageAmount: string;
    nativeAmount: string;
    ragePercentage: string;
    nativePercentage: string;
    nativeProtocolName: string;
  };

  totalSupply: number;
  totalShares: number;
  totalAssets: number;
  assetPrice: number;
  sharePrice: number;
  depositCap: number;
  vaultMarketValue: number;
  avgVaultMarketValue: number;

  totalSupplyD18: string;
  totalSharesD18: string;
  totalAssetsD18: string;
  assetPriceD18: string;
  sharePriceD18: string;
  depositCapD18: string;
  vaultMarketValueD6: string;
  avgVaultMarketValueD6: string;
}> {
  const vaultAddress = await getVaultAddressFromVaultName(provider, vaultName);

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

  const avgVaultMarketValueD6 = await getAvgVaultMarketValue(
    await getNetworkNameFromProvider(provider),
    vault
  );

  const poolComposition = await getPoolComposition(provider, vaultName);
  return {
    poolComposition,

    totalSupply,
    totalShares: totalSupply,
    totalAssets,
    assetPrice,
    sharePrice,
    depositCap,
    vaultMarketValue,
    avgVaultMarketValue: Number(formatUsdc(avgVaultMarketValueD6)),

    totalSupplyD18: totalSupplyD18.toString(),
    totalSharesD18: totalSupplyD18.toString(),
    totalAssetsD18: totalAssetsD18.toString(),
    assetPriceD18: parseUnits(String(assetPrice), 18).toString(),
    sharePriceD18: parseUnits(String(sharePrice), 18).toString(),
    depositCapD18: depositCapD18.toString(),
    vaultMarketValueD6: vaultMarketValueD6.toString(),
    avgVaultMarketValueD6: avgVaultMarketValueD6.toString(),
  };
}

export async function getPoolComposition(
  provider: ethers.providers.Provider,
  vaultName: VaultName
): Promise<{
  rageAmount: string;
  nativeAmount: string;
  ragePercentage: string;
  nativePercentage: string;
  nativeProtocolName: string;
}> {
  const { clearingHouse, eth_vToken } = await getCoreContracts(provider);

  const vaultStrategy = BaseVault__factory.connect(
    await getVaultAddressFromVaultName(provider, vaultName),
    provider
  );
  const poolId = truncate(eth_vToken.address);

  // TODO
  const vaultAccountId = await vaultStrategy.rageAccountNo();

  // net position of eth * twap price
  const netPosition = await clearingHouse.getAccountNetTokenPosition(
    vaultAccountId,
    poolId
  );
  const virtualPriceX128 = await clearingHouse.getVirtualTwapPriceX128(poolId);

  const rageAmount = netPosition.abs().mul(virtualPriceX128).div(Q128);
  const nativeAmount = (await vaultStrategy.getVaultMarketValue()).sub(
    rageAmount
  );

  const sum = nativeAmount.add(rageAmount);
  const oneEth = parseEther("1");

  return {
    rageAmount: formatUsdc(rageAmount),
    nativeAmount: formatUsdc(nativeAmount),
    ragePercentage: formatEther(safeDiv(oneEth.mul(rageAmount), sum)),
    nativePercentage: formatEther(safeDiv(oneEth.mul(nativeAmount), sum)),
    nativeProtocolName: getNativeProtocolName(vaultName),
  };
}

async function getAvgVaultMarketValue(
  networkName: NetworkName,
  vault: BaseVault
): Promise<BigNumber> {
  let timestamp = Math.floor(Date.now() / 1000);
  let vmvSum = BigNumber.from(0);

  for (let i = 0; i < 24; i++) {
    const blockNumber = await getBlockByTimestamp(networkName, timestamp);
    const vmv = await vault.getVaultMarketValue({
      blockTag: blockNumber,
    });
    vmvSum = vmvSum.add(vmv);
    timestamp -= 3600;
  }

  return vmvSum.div(24);
}

async function getVaultAddressFromVaultName(
  provider: ethers.providers.Provider,
  vaultName: VaultName
): Promise<string> {
  switch (vaultName) {
    case "tricrypto":
      const { curveYieldStrategy } = await getTricryptoVaultContracts(provider);
      return curveYieldStrategy.address;
    case "gmx":
      const { gmxYieldStrategy } = await getGmxVaultContracts(provider);
      return gmxYieldStrategy.address;
    default:
      throw new Error(`vaultName should be either tricrypto or gmx`);
  }
}

function getNativeProtocolName(vaultName: VaultName) {
  switch (vaultName) {
    case "tricrypto":
      return "Curve";
    case "gmx":
      return "GMX";
    default:
      throw new Error(`vaultName should be either tricrypto or gmx`);
  }
}
