import { NetworkName } from "@ragetrade/sdk";
import { ethers } from "ethers";

export const getStartBlock = (networkName: NetworkName) => {
  switch (networkName) {
    case "arbmain":
      return 44570369;
    default:
      throw new Error(
        `Start block not available for the network: ${networkName}`
      );
  }
};
export const oneInFiftyBlocks = (e: ethers.Event) =>
  [0].includes(e.blockNumber % 50);
