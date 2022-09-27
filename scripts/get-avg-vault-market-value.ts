import { NetworkName, tricryptoVault, formatUsdc } from "@ragetrade/sdk";
import { BigNumber } from "ethers";
import { getProvider } from "../providers";
import { getBlockByTimestamp } from "./get-block-by-timestamp";

// TODO delete this
export async function getAvgVaultMarketValue(networkName: NetworkName) {
  const provider = getProvider(networkName);
  const { curveYieldStrategy } = await tricryptoVault.getContracts(provider);

  let timestamp = Math.floor(Date.now() / 1000);
  let vmvSum = BigNumber.from(0);

  for (let i = 0; i < 24; i++) {
    const blockNumber = await getBlockByTimestamp(networkName, timestamp);
    const vmv = await curveYieldStrategy.getVaultMarketValue({
      blockTag: blockNumber,
    });
    vmvSum = vmvSum.add(vmv);
    timestamp -= 3600;
  }

  return {
    curveYieldStrategy: formatUsdc(vmvSum.div(24)),
  };
}
