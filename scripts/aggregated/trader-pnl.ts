import {
  chainlink,
  deltaNeutralGmxVaults,
  tokens,
  gmxProtocol,
  aave,
} from "@ragetrade/sdk";
import { formatEther, formatUnits } from "ethers/lib/utils";
import { getProviderAggregate } from "../../providers";
import "../../fetch-polyfill";
import { days, timestampRoundDown } from "../../utils";

export interface GlobalTraderPnlEntry {
  blockNumber: number;
  timestamp: number;
  profit: number;
  loss: number;
  traderPnl: number;
  vaultShare: number;
  traderPnlVault: number;
}

export interface GlobalTraderPnlDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  traderPnlNet: number;
  traderPnlVaultNet: number;
}

export interface GlobalTraderPnlResult {
  data: GlobalTraderPnlEntry[];
  dailyData: GlobalTraderPnlDailyEntry[];
  traderPnlNet: number;
  traderPnlVaultNet: number;
}

export async function getTraderPnl(): Promise<GlobalTraderPnlResult> {
  const START_BLOCK = 45607856;

  const provider = getProviderAggregate("arbmain");

  const { glp, fsGLP } = await tokens.getContracts(provider);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    await deltaNeutralGmxVaults.getContracts(provider);

  const gmxSubgraphUrl =
    "https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats";

  const queryTraderData = async (from_ts: string, to_ts: string) => {
    const results = await fetch(gmxSubgraphUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query gmxTraderStats {
            tradingStats(
              first: 1000
              orderBy: timestamp
              orderDirection: desc
              where: { period: "daily", timestamp_gte: ${from_ts}, timestamp_lte: ${to_ts} }
              subgraphError: allow
            ) {
              timestamp
              profit
              loss
              profitCumulative
              lossCumulative
              longOpenInterest
              shortOpenInterest
            }
          }
        `,
      }),
    });

    return (await results.json()).data;
  };

  const currentDate = new Date();
  const to_ts = Math.floor(currentDate.getTime() / 1000).toString();
  const from_ts = (await provider.getBlock(START_BLOCK)).timestamp.toString();

  // let traderPnl = [];
  // let vaultShare = [];
  // let traderPnlVault = 0;

  const traderData = await queryTraderData(from_ts, to_ts);

  const tradingStats = (
    traderData.tradingStats as {
      blockNumber: number;
      timestamp: number;
      profit: string;
      loss: string;
      profitCumulative: string;
      lossCumulative: string;
      longOpenInterest: string;
      shortOpenInterest: string;
    }[]
  ).sort((a, b) => a.timestamp - b.timestamp);

  const data = [];
  // {
  //   traderPnl: number;
  //   vaultShare: number;
  //   traderPnlVault: number;
  // }[] = [];

  for (const each of tradingStats) {
    const loss = Number(formatUnits(each.loss, 30));
    const profit = Number(formatUnits(each.profit, 30));

    const blockNumber = (
      await (
        await fetch(`https://coins.llama.fi/block/arbitrum/${each.timestamp}`)
      ).json()
    ).height;

    let vaultGlp;
    let totalGlp;
    while (1) {
      try {
        vaultGlp = Number(
          formatEther(
            (
              await dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
                blockTag: blockNumber,
              })
            ).add(
              await fsGLP.balanceOf(dnGmxJuniorVault.address, {
                blockTag: blockNumber,
              })
            )
          )
        );

        totalGlp = Number(
          formatEther(await glp.totalSupply({ blockTag: blockNumber }))
        );
        break;
      } catch {}
    }

    if (vaultGlp === undefined || totalGlp === undefined) {
      throw new Error("vaultGlp or totalGlp is undefined");
    }
    // traderPnl.push(profit - loss);
    // vaultShare.push(vaultGlp / totalGlp);
    const traderPnl = profit - loss;
    const vaultShare = vaultGlp / totalGlp;
    const traderPnlVault = traderPnl * vaultShare;
    data.push({
      blockNumber,
      timestamp: each.timestamp,
      profit,
      loss,
      traderPnl,
      vaultShare,
      traderPnlVault,
    });
  }

  // for (const [index, pnl] of traderPnl.entries()) {
  //   traderPnlVault += pnl * vaultShare[index];
  // }

  return {
    data,
    dailyData: data.reduce(
      (acc: GlobalTraderPnlDailyEntry[], cur: GlobalTraderPnlEntry) => {
        const lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.traderPnlNet += cur.traderPnl;
          lastEntry.traderPnlVaultNet += cur.traderPnlVault;
        } else {
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            traderPnlNet: cur.traderPnl,
            traderPnlVaultNet: cur.traderPnlVault,
          });
        }
        return acc;
      },
      []
    ),
    traderPnlNet: data.reduce((acc, cur) => acc + cur.traderPnlVault, 0),
    traderPnlVaultNet: data.reduce((acc, cur) => acc + cur.traderPnlVault, 0),
  };
}
