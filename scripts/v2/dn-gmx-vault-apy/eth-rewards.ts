import "isomorphic-unfetch";
import { BigNumber, Contract, providers } from "ethers";
import {
  deltaNeutralGmxVaults,
  NetworkName,
  gmxProtocol,
  typechain,
  tokens,
} from "@ragetrade/sdk";
import { formatUnits, hexZeroPad } from "ethers/lib/utils";

const IRewardTracker = [
  "function claimable(address) external view returns (uint256)",
];
const feeGlpTracker = "0x4e971a87900b931fF39d1Aad67697F49835400b6";

const rageSubgraphUrl =
  "https://api.thegraph.com/subgraphs/name/fr0ntenddev/rage-trade-dn-vault-mainnet";

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
              partnerVaultMarketValue
            }
          }
        }
      `,
      variables: { vault_id },
    }),
  });

  return (await results.json()).data;
};

const getEthPrice = async () => {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
  );

  const ethPrice = (await res.json()).ethereum.usd;

  return ethPrice;
};

export const getEthRewards = async (networkName: NetworkName) => {
  const provider = new providers.StaticJsonRpcProvider(
    "https://arb-mainnet.g.alchemy.com/v2/ooBOLYafYHW4YWYetC_HZt9VP4UDA6dO"
  );

  const tk = await tokens.getContracts(provider);
  const dn = await deltaNeutralGmxVaults.getContracts(provider);
  const rewardTracker = new Contract(feeGlpTracker, IRewardTracker, provider);

  const unclaimedWeth = await rewardTracker.claimable(
    dn.dnGmxJuniorVault.address
  );
  console.log("unclaimedWeth", unclaimedWeth.toString());

  const protocolFee = BigNumber.from(
    await provider.getStorageAt(
      dn.dnGmxJuniorVault.address,
      hexZeroPad("0x101", 32),
      "latest"
    )
  );
  console.log("protocolFee", protocolFee.toString());

  const seniorVaultWethRewards = BigNumber.from(
    await provider.getStorageAt(
      dn.dnGmxJuniorVault.address,
      hexZeroPad("0x103", 32),
      "latest"
    )
  );
  console.log("seniorVaultWethRewards", seniorVaultWethRewards.toString());

  let unharvestedWeth = await tk.weth.balanceOf(dn.dnGmxJuniorVault.address);
  unharvestedWeth = unharvestedWeth
    .sub(protocolFee)
    .sub(seniorVaultWethRewards);
  console.log("unharvestedWeth", unharvestedWeth.toString());

  const currentDate = new Date();
  const oneWeekOldDate = new Date(currentDate.getDate() - 7);

  const weeks = 52;

  const to_ts = Math.floor(currentDate.getTime() / 1000).toString();
  const from_ts = Math.floor(oneWeekOldDate.getTime() / 1000).toString();

  const vault_id = dn.dnGmxJuniorVault.address.toLowerCase();

  // TODO: handle case where there are more than 1000 rewardsData entries in a week
  const [rewardsData, vaultMktValueData, ethPrice] = await Promise.all([
    queryRewardsData(vault_id, from_ts, to_ts, 1000, 0),
    queryVaultMktValueData(vault_id, from_ts, to_ts, 1000, 0),
    getEthPrice(),
  ]);

  const totalAssets = await dn.dnGmxSeniorVault.totalAssets();
  const totalBorrowed = await dn.dnGmxSeniorVault.totalUsdcBorrowed();

  let currentUtilRate = totalBorrowed.mul(10_000).div(totalAssets).toNumber();
  currentUtilRate = currentUtilRate / 10_000;
  console.log("currentUtilRate", currentUtilRate);

  const {
    optimalUtilizationRate,
    baseVariableBorrowRate,
    variableRateSlope1,
    variableRateSlope2,
  } = await dn.dnGmxSeniorVault.feeStrategy();

  const protocolFeeBps = BigNumber.from(
    await provider.getStorageAt(
      dn.dnGmxJuniorVault.address,
      hexZeroPad("0x104", 32),
      "latest"
    )
  );
  console.log({ protocolFeeBps });

  const optimalUtilRate = Number(formatUnits(optimalUtilizationRate, 30));
  console.log({ optimalUtilRate });

  const base = Number(formatUnits(baseVariableBorrowRate, 30));
  console.log({ base });

  const slope1 = Number(formatUnits(variableRateSlope1, 30));
  console.log({ slope1 });

  const slope2 = Number(formatUnits(variableRateSlope2, 30));
  console.log({ slope2 });

  const excessUtilRate =
    (currentUtilRate - optimalUtilRate) / (1 - optimalUtilRate);
  console.log({ excessUtilRate });

  let srVaultFeeShare = 0;

  currentUtilRate <= optimalUtilRate
    ? (srVaultFeeShare = base + slope1 * currentUtilRate)
    : (srVaultFeeShare = base + slope1 + slope2 * excessUtilRate);
  console.log({ currentUtilRate });

  let juniorVaultAvgVmv = 0;
  let seniorVaultAvgVmv = 0;

  let juniorVaultRewards = 0;
  let seniorVaultRewards = 0;

  console.log(
    "first timestamp",
    rewardsData.vault.rewardsHarvestedEntries[0].timestamp
  );
  console.log(
    "last timestamp",
    rewardsData.vault.rewardsHarvestedEntries[
      rewardsData.vault.rewardsHarvestedEntries.length - 1
    ].timestamp
  );

  if (rewardsData.vault) {
    for (const each of rewardsData.vault.rewardsHarvestedEntries) {
      juniorVaultRewards += Number(each.juniorVaultWeth);
      seniorVaultRewards += Number(each.seniorVaultWeth);
    }
  }

  console.log("juniorVaultRewards", juniorVaultRewards);
  console.log("seniorVaultRewards", seniorVaultRewards);

  if (vaultMktValueData.vault) {
    for (const each of vaultMktValueData.vault.rebalances) {
      juniorVaultAvgVmv += Number(each.vaultMarketValue);
      seniorVaultAvgVmv += Number(each.partnerVaultMarketValue);
    }
  }

  juniorVaultAvgVmv =
    juniorVaultAvgVmv / vaultMktValueData.vault.rebalances.length;
  seniorVaultAvgVmv =
    seniorVaultAvgVmv / vaultMktValueData.vault.rebalances.length;

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

getEthRewards("arbmain");
