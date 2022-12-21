import {
  chainlink,
  deltaNeutralGmxVaults,
  tokens,
  gmxProtocol,
  aave,
} from "@ragetrade/sdk";
import { formatEther } from "ethers/lib/utils";
import { getProviderAggregate } from "../../../providers";
import "../../../fetch-polyfill";

export async function getTraderPnl() {
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

  let traderPnl = [];
  let vaultShare = [];
  let traderPnlVault = 0;

  const traderData = await queryTraderData(from_ts, to_ts);

  for (const each of traderData.tradingStats) {
    const loss = each.loss / 1e30;
    const profit = each.profit / 1e30;

    const block = (
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
                blockTag: block,
              })
            ).add(
              await fsGLP.balanceOf(dnGmxJuniorVault.address, {
                blockTag: block,
              })
            )
          )
        );

        totalGlp = Number(
          formatEther(await glp.totalSupply({ blockTag: block }))
        );
        break;
      } catch {}
    }

    if (vaultGlp === undefined || totalGlp === undefined) {
      throw new Error("vaultGlp or totalGlp is undefined");
    }
    traderPnl.push(profit - loss);
    vaultShare.push(vaultGlp / totalGlp);
  }

  for (const [index, pnl] of traderPnl.entries()) {
    traderPnlVault += pnl * vaultShare[index];
  }

  return traderPnlVault;
}
