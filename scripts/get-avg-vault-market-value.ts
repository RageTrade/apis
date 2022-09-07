import { NetworkName, getVaultContracts, formatUsdc } from "@ragetrade/sdk";
import { BigNumber, ethers } from "ethers";
import { getProvider } from "../providers";
import { getBlockByTimestamp } from "./get-block-by-timestamp";

export type Candle = {
  id: string,
  volumeUSDC: string,
  periodStartUnix: number
}

export async function getAvgVaultMarketValue(networkName: NetworkName, candles: Candle[], normalizedFees: number) {
  const provider = getProvider(networkName);
  const { curveYieldStrategy } = await getVaultContracts(provider);

  let timestamp = Math.floor(Date.now() / 1000);
  let apySum = 0;

  for (const candle of candles) {
    const blockNumber = await getBlockByTimestamp(networkName, candle.periodStartUnix);
    const vmv = await curveYieldStrategy.getVaultMarketValue({
      blockTag: blockNumber,
    });
    apySum += normalizedFees / Number(formatUsdc(vmv));
  }

  console.log(apySum / 24)

  return {
    curveYieldStrategy: apySum / 24
  };
}

getAvgVaultMarketValue('arbmain', [
  {
    id: '0xa237af5e-hourData-461823',
    volumeUSDC: '255.850197',
    periodStartUnix: 1662562800
  },
  {
    id: '0xa237af5e-hourData-461822',
    volumeUSDC: '16153.504282',
    periodStartUnix: 1662559200
  },
  {
    id: '0xa237af5e-hourData-461821',
    volumeUSDC: '11048.621968',
    periodStartUnix: 1662555600
  },
  {
    id: '0xa237af5e-hourData-461820',
    volumeUSDC: '170.073012',
    periodStartUnix: 1662552000
  },
  {
    id: '0xa237af5e-hourData-461819',
    volumeUSDC: '2014.792502',
    periodStartUnix: 1662548400
  },
  {
    id: '0xa237af5e-hourData-461818',
    volumeUSDC: '364.203004',
    periodStartUnix: 1662544800
  },
  {
    id: '0xa237af5e-hourData-461817',
    volumeUSDC: '145.812576',
    periodStartUnix: 1662541200
  },
  {
    id: '0xa237af5e-hourData-461816',
    volumeUSDC: '404.230727',
    periodStartUnix: 1662537600
  },
  {
    id: '0xa237af5e-hourData-461815',
    volumeUSDC: '0.328265',
    periodStartUnix: 1662534000
  },
  {
    id: '0xa237af5e-hourData-461814',
    volumeUSDC: '4.760678',
    periodStartUnix: 1662530400
  },
  {
    id: '0xa237af5e-hourData-461813',
    volumeUSDC: '20',
    periodStartUnix: 1662526800
  },
  {
    id: '0xa237af5e-hourData-461812',
    volumeUSDC: '6.026448',
    periodStartUnix: 1662523200
  },
  {
    id: '0xa237af5e-hourData-461811',
    volumeUSDC: '2454.535024',
    periodStartUnix: 1662519600
  },
  {
    id: '0xa237af5e-hourData-461810',
    volumeUSDC: '1441.199061',
    periodStartUnix: 1662516000
  },
  {
    id: '0xa237af5e-hourData-461808',
    volumeUSDC: '860.396283',
    periodStartUnix: 1662508800
  },
  {
    id: '0xa237af5e-hourData-461807',
    volumeUSDC: '3388.933788',
    periodStartUnix: 1662505200
  },
  {
    id: '0xa237af5e-hourData-461806',
    volumeUSDC: '167.050737',
    periodStartUnix: 1662501600
  },
  {
    id: '0xa237af5e-hourData-461805',
    volumeUSDC: '126.357935',
    periodStartUnix: 1662498000
  },
  {
    id: '0xa237af5e-hourData-461804',
    volumeUSDC: '953.346177',
    periodStartUnix: 1662494400
  },
  {
    id: '0xa237af5e-hourData-461803',
    volumeUSDC: '1477.601216',
    periodStartUnix: 1662490800
  },
  {
    id: '0xa237af5e-hourData-461802',
    volumeUSDC: '2245.495377',
    periodStartUnix: 1662487200
  },
  {
    id: '0xa237af5e-hourData-461801',
    volumeUSDC: '3918.585496',
    periodStartUnix: 1662483600
  },
  {
    id: '0xa237af5e-hourData-461800',
    volumeUSDC: '404.611925',
    periodStartUnix: 1662480000
  },
  {
    id: '0xa237af5e-hourData-461799',
    volumeUSDC: '2466.023501',
    periodStartUnix: 1662476400
  }
]
,
18964.472586829997
)