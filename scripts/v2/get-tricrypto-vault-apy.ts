import "../../fetch-polyfill";

import { BigNumber } from "ethers";
import { gql } from "urql";

import {
  CacheServerDataSource,
  formatUsdc,
  NetworkName,
  tricryptoVault,
} from "@ragetrade/sdk";

import { getSubgraph } from "../../subgraphs";
import { fetchRetry, safeDivNumer } from "../../utils";

import type { Client } from "urql";
const TRICRYPTO_POOL_ADDRESS =
  "0x960ea3e3c7fb317332d990873d354e18d7645590".toLowerCase();

export async function getTricryptoVaultApy(networkName: NetworkName) {
  const ds = new CacheServerDataSource(networkName, "http://localhost:3000");
  const vaultInfo = await ds.getVaultInfo("tricrypto");
  const vault = tricryptoVault.getContractsSync(networkName).curveYieldStrategy;

  const apyEstimation = await getApyEstimation(
    vaultInfo.result.avgVaultMarketValue.value,
    getSubgraph(networkName),
    vault.address
  );
  if (apyEstimation === undefined) {
    throw new Error("Failed to get apy estimation");
  }
  return {
    crvEmissions: apyEstimation[0][1],
    tricryptoLpFees: apyEstimation[1][1],
    rageLpFees: apyEstimation[2][1],
  };
}

type CurvePoolList = {
  address: string;
  latestDailyApy: number;
  latestWeeklyApy: number;
  type: "main" | "crypto" | "factory" | "stable-factory";
};

type SideChainGaugeApy = {
  apy: number;
  name: string;
  address: string;
};

type CurveApyApiResponse = {
  success: boolean;
  data: Record<"sideChainGaugesApys", SideChainGaugeApy[]>;
};

type CurvePoolsApiResponse = {
  success: boolean;
  data: Record<"poolList", CurvePoolList[]>;
};

async function getApyEstimation(
  avgVaultMarketValueD6: BigNumber,
  graphqlClient: Client,
  vaultAddress: string
): Promise<Array<[name: string, value: number | undefined]> | undefined> {
  const apyPayload = await fetchRetry(
    "https://api.curve.fi/api/getFactoGaugesCrvRewards/arbitrum"
  );
  const apyResponse: CurveApyApiResponse = await apyPayload.json();

  const crvApy = apyResponse.data.sideChainGaugesApys.find(
    (item) => item.address.toLowerCase() === TRICRYPTO_POOL_ADDRESS
  );

  const feesPayload = await fetchRetry(
    "https://api.curve.fi/api/getSubgraphData/arbitrum"
  );
  const feesResponse: CurvePoolsApiResponse = await feesPayload.json();

  const feesApy = feesResponse.data.poolList.find(
    (item) => item.address.toLowerCase() === TRICRYPTO_POOL_ADDRESS
  );

  const earnings = await getVaultLpFeesEarnings(graphqlClient, vaultAddress);

  const rageAPY = safeDivNumer(
    earnings * 365,
    Number(formatUsdc(avgVaultMarketValueD6))
  );

  if (crvApy !== undefined && feesApy !== undefined)
    return [
      ["CRV Emissions", crvApy.apy / 100],
      ["3CRV LP Fees APY", feesApy.latestDailyApy / 100],
      ["Rage LP Fees APY", rageAPY],
    ];
}

export type VaultRebalanceQueryVariables = {
  id: string;
};

export type VaultRebalanceQuery = {
  __typename?: "Query";
  vault?: {
    __typename?: "Vault";
    totalLiquidityPositionEarningsRealized: string;
    rageAccount: {
      __typename?: "Account";
      totalLiquidityPositionEarningsRealized: string;
    };
    rebalances: Array<{
      __typename?: "VaultRebalance";
      id: string;
      timestamp: string;
      liquidityPositionEarningsRealized: string;
    }>;
  } | null;
};

export const RebalanceFragmentDoc = gql`
  fragment Rebalance on VaultRebalance {
    id
    timestamp
    liquidityPositionEarningsRealized
  }
`;

export const VaultRebalanceDocument = gql`
  query vaultRebalance($id: ID!) {
    vault(id: $id) {
      totalLiquidityPositionEarningsRealized
      rageAccount {
        totalLiquidityPositionEarningsRealized
      }
      rebalances(orderBy: timestamp, orderDirection: desc, first: 2) {
        ...Rebalance
      }
    }
  }
  ${RebalanceFragmentDoc}
`;

export async function getVaultLpFeesEarnings(
  graphqlClient: Client,
  vaultAddress: string
) {
  const res = await graphqlClient
    .query<VaultRebalanceQuery, VaultRebalanceQueryVariables>(
      VaultRebalanceDocument,
      {
        id: vaultAddress.toLowerCase(),
      }
    )
    .toPromise();

  const rebalances = res.data?.vault?.rebalances;

  if (rebalances?.[0] && rebalances?.[1]) {
    const lpFeesInLastRebalance = Number(
      rebalances[0].liquidityPositionEarningsRealized
    );
    // duration of rebalance would not exactly be 24 hours, it might be few mins off
    const durationOfLastRebalance =
      Number(rebalances[0].timestamp) - Number(rebalances[1].timestamp);

    return (lpFeesInLastRebalance * (24 * 60 * 60)) / durationOfLastRebalance; // normalize to 24 hours
  } else {
    return Number(rebalances?.[0]?.liquidityPositionEarningsRealized || 0);
  }
}
