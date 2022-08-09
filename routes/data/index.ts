import express from "express";
import getAccountIdsByAddressRouter from "./get-account-ids-by-address";
import getBlockByTimestamp from "./get-block-by-timestamp";

const router = express.Router();

router.use(getAccountIdsByAddressRouter);
router.use(getBlockByTimestamp);

export default router;
