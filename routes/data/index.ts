import express from "express";
import getAccountIdsByAddressRouter from "./get-account-ids-by-address";

const router = express.Router();

router.use(getAccountIdsByAddressRouter);

export default router;
