import { NetworkName } from "@ragetrade/sdk";
import Debugger from "debug";
import { fetchJson } from "ethers/lib/utils";

const debug = Debugger("apis:scripts:getBlockByTimestamp");

export async function getBlockByTimestamp(
  networkName: NetworkName,
  timestamp: number
): Promise<number> {
  const baseUrl: string =
    networkName === "arbmain"
      ? "https://api.arbiscan.io"
      : "https://api-testnet.arbiscan.io";

  while (1) {
    const resp = await fetchJson(
      `${baseUrl}/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before&apikey=${process.env.ARBISCAN_KEY}`
    );
    if (resp.status === "1") {
      return parseInt(resp.result);
    }
    if (JSON.stringify(resp).includes("Max rate limit reached")) {
      await new Promise((res) =>
        setTimeout(res, 1000 + Math.floor(Math.random() * 100))
      );
      debug("Arbiscan retry");
      continue; // try again
    } else {
      throw new Error(`Arbiscan Api Failed: ${JSON.stringify(resp)}`);
    }
  }

  debug("this cannot happen");
  throw new Error("This cannot happen, in scripts/getBlockByTimestamp");
}
