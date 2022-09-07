import { NetworkName } from "@ragetrade/sdk";
import { fetchJson } from "ethers/lib/utils";

export async function getBlockByTimestamp(
  networkName: NetworkName,
  timestamp: number
): Promise<number> {
  const baseUrl: string =
    networkName === "arbmain"
      ? "https://api.arbiscan.io"
      : "https://api-testnet.arbiscan.io";

  const resp = await fetchJson(
    `${baseUrl}/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before&apikey=${process.env.ARBISCAN_KEY}`
  );
  if (resp.status === "1") {
    return parseInt(resp.result);
  } else {
    throw new Error(`Arbiscan Api Failed: ${JSON.stringify(resp)}`);
  }
}
