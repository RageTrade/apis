import { getProvider } from "../providers";
import { getBlockByTimestamp } from "./get-block-by-timestamp";
import { NetworkName, getVaultContracts, formatUsdc } from "@ragetrade/sdk";

export type Candle = {
  id: string,
  volumeUSDC: string,
  periodStartUnix: number
}

export async function getAvgVaultMarketValue(networkName: NetworkName, candles: Candle[]) {
  const provider = getProvider(networkName);
  const { curveYieldStrategy } = await getVaultContracts(provider);

  let apySum = 0;

  for (const candle of candles) {
    const blockNumber = await getBlockByTimestamp(networkName, candle.periodStartUnix);
    const vmv = await curveYieldStrategy.getVaultMarketValue({
      blockTag: blockNumber,
    });
    apySum += Number(candle.volumeUSDC) * 24 * 365 * 0.001 / Number(formatUsdc(vmv));
  }

  console.log(apySum / 24)

  return {
    curveYieldStrategyApy: (apySum / 24) * 100
  };
}
