import express from "express";
import getAccountIdsByAddressRouter from "./get-account-ids-by-address";
import getBlockByTimestamp from "./get-block-by-timestamp";
import getPrices from "./get-prices";
import getGmxData from "./get-gmx-data";

const router = express.Router();

router.use(getAccountIdsByAddressRouter);
router.use(getBlockByTimestamp);
router.use(getPrices);
router.use(getGmxData);

export default router;
