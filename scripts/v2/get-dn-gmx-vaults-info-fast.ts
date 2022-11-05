import {
  getDnGmxVaultsInfoFast as getDnGmxVaultsInfoFastSDK,
  NetworkName,
  stringifyBigNumber,
} from "@ragetrade/sdk";
import { getProvider } from "../../providers";

export async function getDnGmxVaultsInfoFast(networkName: NetworkName) {
  const provider = getProvider(networkName);
  const result = await getDnGmxVaultsInfoFastSDK(provider);
  return stringifyBigNumber(result);
}
