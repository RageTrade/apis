import { config } from "dotenv";
import { fetchJson } from "ethers/lib/utils";
import express from "express";

import {
  handleRuntimeErrors,
  parseInteger,
  parseNetworkName,
} from "../../utils";

config();

const router = express.Router();

router.get(
  "/get-block-by-timestamp",
  handleRuntimeErrors(async (req) => {
    const networkName = parseNetworkName(req.query.networkName);
    const timestamp = parseInteger(req.query.timestamp, "timestamp");

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
  })
);

export default router;
