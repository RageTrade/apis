import createError from "http-errors";
import express, { ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import cors from "cors";

import { router } from "./routes";

export const app = express();

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors());

app.use("/", router);

// catch 404 and forward to error handler
app.use(function (_req, _res, next) {
  next(createError(404));
});

const errorHandler: ErrorRequestHandler = function (err, req, res, _next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  const status = err.status || 500;
  res.status(status);
  res.json({ error: err.message, status });
};
app.use(errorHandler);
