import express from "express";
import logsRouter from "./logs";

export const router = express.Router();

/* GET home page. */
router.get("/", function (req, res, next) {
  res.json({ hello: "world" });
});

router.use("/logs", logsRouter);
