import {
  getDnGmxVaultsInfo as getDnGmxVaultsInfoSDK,
  NetworkName,
  stringifyBigNumber,
} from "@ragetrade/sdk";
import { getProvider } from "../../providers";

export async function getDnGmxVaultsInfo(networkName: NetworkName) {
  const provider = getProvider(networkName);
  const result = await getDnGmxVaultsInfoSDK(provider);
  return stringifyBigNumber(result);
}
