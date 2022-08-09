import { NetworkName } from "@ragetrade/sdk";
import { config } from "dotenv";
import { ethers } from "ethers";

config();

export const arbmain = new ethers.providers.StaticJsonRpcProvider(
  "https://arb1.arbitrum.io/rpc"
);
export const arbtest = new ethers.providers.StaticJsonRpcProvider(
  "https://rinkeby.arbitrum.io/rpc"
);

export function getProvider(
  networkName: NetworkName
): ethers.providers.Provider {
  switch (networkName) {
    case "arbmain":
      return arbmain;
    case "arbtest":
      return arbtest;
    default:
      throw new Error(`Provider not available for the network: ${networkName}`);
  }
}
