import { NetworkName, findBlockByTimestamp } from "@ragetrade/sdk";
import Debugger from "debug";
import { getProvider } from "../providers";
import { fetchJsonRetry, fetchRetry } from "../utils";

const debug = Debugger("apis:scripts:getBlockByTimestamp");

export async function getBlockByTimestamp(
  networkName: NetworkName,
  timestamp: number
): Promise<number> {
  // try this single query first
  if (networkName === "arbmain") {
    try {
      return Number(
        (
          await (
            await fetchRetry(
              `https://coins.llama.fi/block/arbitrum/${timestamp}`
            )
          ).json()
        ).height
      );
    } catch {}
  }

  //  TODO change once etherscan supports this network
  if (networkName === "arbgoerli") {
    const block = await findBlockByTimestamp(
      getProvider("arbgoerli"),
      timestamp,
      {
        allowFutureTimestamp: true,
      }
    );
    return block.number;
  }

  const baseUrl: string =
    networkName === "arbmain"
      ? "https://api.arbiscan.io"
      : "https://api-testnet.arbiscan.io";

  while (1) {
    const request = `${baseUrl}/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before&apikey=${process.env.ARBISCAN_KEY}`;
    const resp = await fetchJsonRetry(request);
    if (resp.status === "1") {
      const result = parseInt(resp.result);
      if (!isNaN(result)) {
        return result;
      }
    }
    if (JSON.stringify(resp).includes("Max rate limit reached")) {
      await new Promise((res) =>
        setTimeout(res, 1000 + Math.floor(Math.random() * 100))
      );
      debug("Arbiscan retry");
      continue; // try again
    } else {
      throw new Error(
        `Arbiscan Api Failed. Request: ${request}. Response: ${JSON.stringify(
          resp
        )}`
      );
    }
  }

  debug("this cannot happen");
  throw new Error("This cannot happen, in scripts/getBlockByTimestamp");
}
