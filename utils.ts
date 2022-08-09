import { NetworkName } from "@ragetrade/sdk";
import { getAddress, isAddress } from "ethers/lib/utils";

export function parseAddress(input: any, paramName: string): string {
  if (!isAddress(input)) {
    throwError(paramName);
  }
  return getAddress(input);
}

export function parseString(input: any, paramName: string): string {
  if (typeof input !== "string") {
    throwError(paramName);
  }
  return input;
}

export function parseNetworkName(input: any): NetworkName {
  const str = parseString(input, "networkName");
  if (!["arbmain", "arbtest"].includes(str)) {
    throw new Error('networkName must be "arbmain" or "arbtest"');
  }

  return str as NetworkName;
}

export function throwError(name: string, type?: string) {
  throw new Error(`Invalid ${type ?? "value"} passed for ${name}`);
}
