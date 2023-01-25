import { ethers } from "ethers";

import { gmxProtocol, NetworkName } from "@ragetrade/sdk";

import { getLogsInLoop } from "../../helpers";
import { getStartBlock, oneInFiftyBlocks } from "./common";

export async function increaseUsdgAmount(
  networkName: NetworkName,
  provider: ethers.providers.Provider
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

  const endBlock = await provider.getBlockNumber();

  const logs = await getLogsInLoop(
    _gmxUnderlyingVault,
    _gmxUnderlyingVault.filters.IncreaseUsdgAmount(),
    getStartBlock(networkName),
    endBlock,
    2000
  );

  return logs.filter(oneInFiftyBlocks);
}
