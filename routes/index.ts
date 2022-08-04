import express from "express";
import logsRouter from "./logs";
import dataRouter from "./data";

export const router = express.Router();

router.get("/", function (req, res, next) {
  res.json({ hello: "world" });
});

router.use("/logs", logsRouter);
router.use("/data", dataRouter);
