import { BigNumber, ethers } from "ethers";
import { fetchJson, formatEther, parseEther } from "ethers/lib/utils";
import { gql } from "urql";

import {
  deltaNeutralGmxVaults,
  NetworkName,
  ResultWithMetadata,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";
import { getSubgraph } from "../../../subgraphs";
import { ErrorWithStatusCode } from "../../../utils";
import { GlobalTotalSharesResult } from "../total-shares";
import { combine } from "../util/combine";
import { Entry } from "../util/types";
import whitelist from "./whitelist";
import { matchWithNonOverlappingEntries } from "./common";

export type UserSharesEntry = Entry<{
  timestamp: number;
  userJuniorVaultShares: number;
  userSeniorVaultShares: number;
  totalJuniorVaultShares: number;
  totalSeniorVaultShares: number;
}>;

export interface UserSharesResult {
  data: UserSharesEntry[];
  userJuniorVaultShares: number;
  userSeniorVaultShares: number;
}

type Action = "send" | "receive" | "deposit" | "withdraw";

export async function getUserShares(
  networkName: NetworkName,
  userAddress: string,
  excludeRawData: boolean
): Promise<ResultWithMetadata<UserSharesResult>> {
  if (excludeRawData) {
    const resp: any = await fetchJson({
      url: `http://localhost:3000/data/aggregated/user/get-shares?networkName=${networkName}&userAddress=${userAddress}`,
      timeout: 1_000_000_000, // huge number
    });
    delete resp.result.data;
    return resp.result;
  }

  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxSeniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  // for preventing abuse of user specific APIs
  // check if user is in whitelist
  if (
    !whitelist.map((a) => a.toLowerCase()).includes(userAddress.toLowerCase())
  ) {
    // otherwise, check if user has any shares in either vault
    const currentJuniorVaultShares = await dnGmxJuniorVault.balanceOf(
      userAddress
    );
    const currentSeniorVaultShares = await dnGmxJuniorVault.balanceOf(
      userAddress
    );
    if (
      currentJuniorVaultShares.lt(parseEther("100")) &&
      currentSeniorVaultShares.lt(parseEther("100"))
    ) {
      throw new ErrorWithStatusCode(
        `Balance of junior or senior vault shares found to be ${formatEther(
          currentJuniorVaultShares
        )} and ${formatEther(
          currentSeniorVaultShares
        )}, hence not allowed to perform user specific aggregate query for this address.`,
        400
      );
    }
  }

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const graphqlClient = getSubgraph(networkName);

  const resp = await graphqlClient
    .query(
      gql`
        query getTransfers($userAddress: ID!) {
          owner(id: $userAddress) {
            id
            vaultTransferEntries {
              timestamp
              blockNumber
              party {
                id
              }
              value
              action
              vault {
                id
              }
            }
            vaultDepositWithdrawEntries {
              timestamp
              blockNumber
              sharesTokenAmount
              action
              vault {
                id
              }
            }
          }
        }
      `,
      { userAddress: userAddress.toLowerCase() }
    )
    .toPromise();

  function truncateDecimals(str: string, decimals = 18) {
    const split = str.split(".");
    if (split.length === 1) {
      return split[0];
    } else if (split.length !== 2) {
      throw new Error("truncateDecimals: Invalid input: " + str);
    }
    return split[0] + "." + split[1].slice(0, decimals);
  }

  const transfers = ((resp.data.owner?.vaultTransferEntries ?? []) as any[])
    .map((t: any) => ({
      timestamp: Number(t.timestamp),
      blockNumber: Number(t.blockNumber),
      value: BigNumber.from(t.value),
      action: t.action as Action,
      vault: t.vault.id as string,
      party: t.party.id as string | undefined,
    }))
    .filter(
      (t) =>
        // the entry if party is any of these addresses
        ![
          ethers.constants.AddressZero,
          dnGmxBatchingManager.address,
          dnGmxJuniorVault.address,
          dnGmxSeniorVault.address,
        ]
          .map((s) => s.toLowerCase())
          .includes(t.party?.toLowerCase() ?? "")
    )
    .concat(
      ((resp.data.owner?.vaultDepositWithdrawEntries ?? []) as any[]).map(
        (t: any) => ({
          timestamp: Number(t.timestamp),
          blockNumber: Number(t.blockNumber),
          value: parseEther(truncateDecimals(t.sharesTokenAmount)),
          action: t.action as Action,
          vault: t.vault.id as string,
          party: undefined,
        })
      )
    )
    .sort((a, b) => a.blockNumber - b.blockNumber);

  const balances: {
    blockNumber: number;
    timestamp: number;
    userJuniorVaultShares: BigNumber;
    userSeniorVaultShares: BigNumber;
  }[] = [
    {
      blockNumber: 0,
      timestamp: 0,
      userJuniorVaultShares: ethers.constants.Zero,
      userSeniorVaultShares: ethers.constants.Zero,
    },
  ];

  for (const transfer of transfers) {
    const lastBalance = balances[balances.length - 1];
    const newBalance = {
      // blockNumber: transfer.blockNumber,
      ...transfer,
      userJuniorVaultShares: lastBalance.userJuniorVaultShares,
      userSeniorVaultShares: lastBalance.userSeniorVaultShares,
    };
    let balanceIncrease: BigNumber;
    if (transfer.action === "send" || transfer.action === "withdraw") {
      balanceIncrease = transfer.value.mul(-1);
    } else if (transfer.action === "receive" || transfer.action === "deposit") {
      balanceIncrease = transfer.value.abs();
    } else {
      throw new Error("getUserShares: Unknown action: " + transfer.action);
    }

    if (
      transfer.vault.toLowerCase() === dnGmxJuniorVault.address.toLowerCase()
    ) {
      newBalance.userJuniorVaultShares =
        newBalance.userJuniorVaultShares.add(balanceIncrease);
    } else if (
      transfer.vault.toLowerCase() === dnGmxSeniorVault.address.toLowerCase()
    ) {
      newBalance.userSeniorVaultShares =
        newBalance.userSeniorVaultShares.add(balanceIncrease);
    } else {
      throw new Error("getUserShares: Unknown vault: " + transfer.vault);
    }

    balances.push(newBalance);
  }

  const data = combine(
    balances,
    totalSharesData.result.data,
    matchWithNonOverlappingEntries.bind(null, totalSharesData.result.data),
    (b, t) => {
      return {
        blockNumber: b.blockNumber,
        timestamp: b.timestamp,
        userJuniorVaultShares: Number(formatEther(b.userJuniorVaultShares)),
        userSeniorVaultShares: Number(formatEther(b.userSeniorVaultShares)),
        totalJuniorVaultShares: t.totalJuniorVaultShares,
        totalSeniorVaultShares: t.totalSeniorVaultShares,
      };
    }
  );

  return {
    cacheTimestamp: totalSharesData.cacheTimestamp,
    result: {
      data,
      userJuniorVaultShares: data[data.length - 1]?.userJuniorVaultShares ?? 0,
      userSeniorVaultShares: data[data.length - 1]?.userSeniorVaultShares ?? 0,
    },
  };
}
