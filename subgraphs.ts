import { NetworkName } from "@ragetrade/sdk";
import { devtoolsExchange } from "@urql/devtools";
import { createClient, defaultExchanges, Client } from "urql";

const exchanges = [devtoolsExchange, ...defaultExchanges];

export const arbitrumClient = createClient({
  // url: "https://api.thegraph.com/subgraphs/name/fr0ntenddev/rage-trade-arbitrum-mainnet",
  url: "https://api.thegraph.com/subgraphs/name/fr0ntenddev/rage-trade",
  exchanges,
});

export const arbitrumGoerliClient = createClient({
  url: "https://api.thegraph.com/subgraphs/name/fr0ntenddev/rage-trade-arbitrum-goerli",
  exchanges,
});

export function getSubgraph(networkName: NetworkName): Client {
  switch (networkName) {
    case "arbmain":
      return arbitrumClient;
    case "arbgoerli":
      return arbitrumGoerliClient;
    default:
      throw new Error(`Subgraph not available for the network: ${networkName}`);
  }
}
