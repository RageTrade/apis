import {
  NetworkName,
  getGmxVaultInfo as getGmxVaultInfoSDK,
  stringifyBigNumber,
} from "@ragetrade/sdk";
import { getProvider } from "../../providers";

export async function getGmxVaultInfo(networkName: NetworkName) {
  const provider = getProvider(networkName);
  const result = await getGmxVaultInfoSDK(provider);
  return stringifyBigNumber(result);
}
