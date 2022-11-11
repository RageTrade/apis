import "isomorphic-unfetch";
import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { getProvider } from "../../../providers";

const rageSubgraphUrl =
  "https://api.thegraph.com/subgraphs/name/fr0ntenddev/rage-trade";

const queryRewardsData = async (
  vault_id: string,
  from_ts: string,
  to_ts: string,
  first: number,
  skip: number
) => {
  const results = await fetch(rageSubgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query dnGmxRewardsHarvested($vault_id: ID!) {
          vault(id: $vault_id) {
            rewardsHarvestedEntries(
              first: ${first}
              skip: ${skip}
              orderBy: timestamp
              orderDirection: desc
              where: { timestamp_gte: ${from_ts}, timestamp_lte: ${to_ts} }
            ) {
                id
                timestamp
                blockNumber
                wethHarvested
                esGmxStaked
                juniorVaultWeth
                seniorVaultWeth
                juniorVaultGlp
                seniorVaultAUsdc
            }
          }
        }
      `,
      variables: { vault_id },
    }),
  });

  return (await results.json()).data;
};

const queryVaultMktValueData = async (
  vault_id: string,
  from_ts: string,
  to_ts: string,
  first: number,
  skip: number
) => {
  const results = await fetch(rageSubgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query vaultRebalances($vault_id: ID!) {
          vault(id: $vault_id) {
            rebalances(
              first: ${first}
              skip: ${skip}
              orderBy: timestamp
              orderDirection: desc
              where: { timestamp_gte: ${from_ts}, timestamp_lte: ${to_ts} }
            ) {
              id
              vaultMarketValue
            }
          }
        }
      `,
      variables: { vault_id },
    }),
  });

  return (await results.json()).data;
};

export const getEthRewards = async (networkName: NetworkName) => {
  const provider = getProvider(networkName);
  const dn = await deltaNeutralGmxVaults.getContracts(provider);

  const currentDate = new Date();
  const oneWeekOldDate = new Date(currentDate.getDate() - 7);

  const weeks = 52;
  const adminFeeFraction = 0.1;

  const to_ts = Math.floor(currentDate.getTime() / 1000).toString();
  const from_ts = Math.floor(oneWeekOldDate.getTime() / 1000).toString();

  const vault_id = dn.dnGmxJuniorVault.address.toLowerCase();

  // TODO: handle case where there are more than 1000 rewardsData entries in a week
  const rewardsData = await queryRewardsData(vault_id, from_ts, to_ts, 1000, 0);
  const vaultMktValueData = await queryVaultMktValueData(
    vault_id,
    from_ts,
    to_ts,
    1000,
    0
  );

  const ethPrice = (
    await (
      await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
      )
    ).json()
  ).ethereum.usd;

  let juniorVaultAvgVmv = 0;
  let seniorVaultAvgVmv = 0;

  let juniorVaultRewards = 0;
  let seniorVaultRewards = 0;

  if (rewardsData.vault) {
    for (const each of rewardsData.vault.rewardsHarvestedEntries) {
      // TODO: handle weth decimals, should be done when there are non-zero values from subgraph
      juniorVaultRewards +=
        Number(each.juniorVaultWeth) / (1 - adminFeeFraction);
      seniorVaultRewards +=
        Number(each.seniorVaultWeth) / (1 - adminFeeFraction);
    }
  }

  if (vaultMktValueData.vault) {
    for (const each of vaultMktValueData.vault.rebalances) {
      juniorVaultAvgVmv += Number(each.vaultMarketValue);

      // TODO: once senior vault market value is added in subgraph for junior vault rebalance
      // compute avg vault market value for senior vault
    }
  }

  juniorVaultAvgVmv =
    vaultMktValueData > 0
      ? juniorVaultAvgVmv / vaultMktValueData.vault.rebalances.length
      : 0;

  // TODO: replace "vaultMktValueData.vault.rebalances.length" with appropriate value for senior tranche
  seniorVaultAvgVmv =
    vaultMktValueData > 0
      ? seniorVaultAvgVmv / vaultMktValueData.vault.rebalances.length
      : 0;

  const jrVaultRewardsApy =
    juniorVaultAvgVmv > 0
      ? (juniorVaultRewards * ethPrice * weeks) / juniorVaultAvgVmv
      : 0;
  const srVaultRewardsApy =
    seniorVaultAvgVmv > 0
      ? (seniorVaultRewards * ethPrice * weeks) / seniorVaultAvgVmv
      : 0;

  return [jrVaultRewardsApy * 100, srVaultRewardsApy * 100];
};
