import { NetworkName } from "@ragetrade/sdk";
import { devtoolsExchange } from "@urql/devtools";
import { createClient, defaultExchanges, Client } from "urql";

const exchanges = [devtoolsExchange, ...defaultExchanges];

export const arbitrumClient = createClient({
  url: "https://api.thegraph.com/subgraphs/name/134dd3v/ragetrade-arbmain",
  exchanges,
});

export const arbitrumRinkebyClient = createClient({
  url: "https://api.thegraph.com/subgraphs/name/134dd3v/ragetrade",
  exchanges,
});

export function getSubgraph(networkName: NetworkName): Client {
  switch (networkName) {
    case "arbmain":
      return arbitrumClient;
    case "arbtest":
      return arbitrumRinkebyClient;
    default:
      throw new Error(`Subgraph not available for the network: ${networkName}`);
  }
}
