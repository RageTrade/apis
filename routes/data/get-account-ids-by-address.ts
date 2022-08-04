import { isAddress } from "ethers/lib/utils";
import express from "express";
import createError from "http-errors";
import { JsonStore } from "../../store/json-store";

const testnetStore = new JsonStore<number[]>(
  "data/testnet/account-created.json"
);

const router = express.Router();

router.get(
  "/arbtest/get-account-ids-by-address",
  generateRequestHandler(testnetStore)
);
// router.get("arbmain/get-account-ids-by address", generateRequestHandler(testnetStore));

export default router;

function generateRequestHandler(
  store: JsonStore<number[]>
): express.RequestHandler {
  return async function (req, res, next) {
    const address = req.query.address as string;
    if (!isAddress(address)) {
      next(createError(400, "Invalid address"));
      return;
    }
    console.log("address valud", address);

    const result = (await store.get(address)) ?? [];
    console.log({ result });
    res.json({ result });
  };
}
