import { getProvider } from "../providers";
import { getBlockByTimestamp } from "./get-block-by-timestamp";
import {
  NetworkName,
  tricryptoVault,
  formatUsdc,
  truncate,
  core,
} from "@ragetrade/sdk";
import { getSubgraph } from "../subgraphs";
import { gql } from "urql";

export type Candle = {
  id: string;
  volumeUSDC: string;
  periodStartUnix: number;
};

export async function getVaultApyInfo(networkName: NetworkName) {
  const provider = getProvider(networkName);
  const { eth_vToken } = await core.getContracts(provider);
  const { curveYieldStrategy } = await tricryptoVault.getContracts(provider);
  const graphqlClient = await getSubgraph(networkName);

  const candles = await graphqlClient
    .query(
      gql`
        query rageTradePoolChartHourVolumeData($poolId: ID!) {
          rageTradePool(id: $poolId) {
            hourData {
              data(first: 24, orderDirection: desc, orderBy: periodStartUnix) {
                id
                volumeUSDC
                periodStartUnix
              }
            }
          }
        }
      `,
      { poolId: truncate(eth_vToken.address).toLowerCase() }
    )
    .toPromise();

  const candleResponse = candles?.data?.rageTradePool?.hourData.data;

  let apySum = 0;

  for (const candle of candleResponse) {
    const blockNumber = await getBlockByTimestamp(
      networkName,
      candle.periodStartUnix
    );
    const vmv = await curveYieldStrategy.getVaultMarketValue({
      blockTag: blockNumber,
    });
    apySum +=
      (Number(candle.volumeUSDC) * 24 * 365 * 0.001) / Number(formatUsdc(vmv));
  }

  // console.log(apySum / 24);

  return {
    curveYieldStrategyApy: (apySum / 24) * 100,
  };
}
