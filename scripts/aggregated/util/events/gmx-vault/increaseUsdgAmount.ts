import { ethers } from "ethers";

import { gmxProtocol, NetworkName } from "@ragetrade/sdk";

import { getLogsInLoop } from "../../helpers";
import { getStartBlock, GET_LOGS_INTERVAL, oneInFiftyBlocks } from "./common";

export async function increaseUsdgAmount(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlockNumberOverride?: number
): Promise<ethers.Event[]> {
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(
    networkName,
    provider
  );

  const _gmxUnderlyingVault = new ethers.Contract(
    gmxUnderlyingVault.address,
    ["event IncreaseUsdgAmount(address token, uint256 amount)"], // bcz not currently in interface in dn vault repo
    provider
  );

  let startBlock = getStartBlock(networkName);
  const endBlock = await provider.getBlockNumber();

  if (typeof startBlockNumberOverride === "number") {
    // to make sure cache is hit for various startBlockNumberOverride
    startBlock +=
      GET_LOGS_INTERVAL *
      Math.floor((startBlockNumberOverride - startBlock) / GET_LOGS_INTERVAL);
  }

  const logs = await getLogsInLoop(
    _gmxUnderlyingVault,
    _gmxUnderlyingVault.filters.IncreaseUsdgAmount(),
    startBlock,
    endBlock,
    GET_LOGS_INTERVAL
  );

  return logs.filter(oneInFiftyBlocks);
}