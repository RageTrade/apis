import {
  getVault,
  NetworkName,
  stringifyBigNumber,
  VaultName,
  Amount,
  BigNumberStringified,
  formatUsdc,
} from "@ragetrade/sdk";

import { getProvider } from "../../providers";

export async function getVaultMarketValue(
  networkName: NetworkName,
  vaultName: VaultName
): Promise<{ vaultMarketValue: BigNumberStringified<Amount> }> {
  const provider = getProvider(networkName);

  const { vault } = await getVault(provider, vaultName);
  const vmvD6 = await vault.getVaultMarketValue();

  return {
    vaultMarketValue: {
      decimals: 6,
      value: stringifyBigNumber(vmvD6),
      formatted: formatUsdc(vmvD6),
    },
  };
}
