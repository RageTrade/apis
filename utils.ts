import { getAddress, isAddress } from "ethers/lib/utils";
import express from "express";
import createError from "http-errors";
import { Request } from "express";

import { NetworkName } from "@ragetrade/sdk";

export function getParamAsAddress(req: Request, paramName: string): string {
  const input = getParamAsString(req, paramName);
  if (!isAddress(input)) {
    throw invalidInputError({ paramName, type: "Address", value: input });
  }
  return getAddress(input);
}

export function getParamAsNumber(req: Request, paramName: string): number {
  const input = getParamAsString(req, paramName);
  const parsed = parseInt(input);
  if (isNaN(parsed)) {
    throw invalidInputError({ paramName, type: "Number", value: input });
  }
  return parsed;
}

export function getParamAsInteger(req: Request, paramName: string): number {
  const input = getParamAsNumber(req, paramName);
  if (!Number.isInteger(input)) {
    throw invalidInputError({ paramName, type: "Integer", value: input });
  }
  return input;
}

export function getNetworkName(req: Request): NetworkName {
  const str = getParamAsString(req, "networkName");
  if (!["arbmain", "arbtest"].includes(str)) {
    throw new ErrorWithStatusCode(
      'networkName must be "arbmain" or "arbtest"',
      400
    );
  }

  return str as NetworkName;
}

export function getParamAsString(req: Request, paramName: string): string {
  const input = getParam(req, paramName);
  if (typeof input !== "string") {
    throw invalidInputError({ paramName, value: input, type: "string" });
  }
  return input;
}

export function getParam(
  req: Request,
  paramName: string,
  required: boolean = true
) {
  const input = req.query[paramName];
  if (required && input === undefined) {
    throw new ErrorWithStatusCode(
      `"${paramName}" param is required but not provided`,
      400
    );
  }
  return input;
}

export class ErrorWithStatusCode extends Error {
  status: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.status = statusCode;
  }
}

export function invalidInputError(opts: {
  paramName: string;
  type?: string;
  value?: any;
}) {
  const error = new ErrorWithStatusCode(
    `Invalid ${opts.type ?? "value"} ${
      opts.value || true ? `(${String(opts.value)}) ` : ""
    }passed for ${opts.paramName}`,
    400
  );
  return error;
}

export function handleRuntimeErrors(
  fn: express.RequestHandler
): express.RequestHandler {
  return async (req, res, next) => {
    try {
      const result = await fn(req, res, next);
      res.json({ result });
    } catch (e: any) {
      next(createError(e.status ?? 500, removeApiKeysFromString(e.message)));
    }
  };
}

export async function retry<R>(
  fn: () => R | Promise<R>,
  failedValue?: R
): Promise<R> {
  const delay: number = 2000;
  let lastError: any;
  let i = 3;
  while (i--) {
    try {
      const res = await fn();
      return res;
    } catch (e) {
      lastError = e;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  if (failedValue === undefined) {
    throw lastError;
  } else {
    return failedValue;
  }
}

export function removeApiKeysFromString(msg: string): string {
  const apiKeys = [
    process.env.ALCHEMY_KEY,
    process.env.INFURA_KEY,
    process.env.ARBISCAN_KEY,
  ].filter((v) => !!v) as string[];
  let prevLength = msg.length;

  for (const apiKey of apiKeys) {
    do {
      prevLength = msg.length;
      msg = msg.replace(apiKey, "<api-key-removed>");
    } while (msg.length !== prevLength);
  }
  return msg;
}
