import { getAddress, isAddress } from "ethers/lib/utils";
import express from "express";
import createError from "http-errors";

import { NetworkName } from "@ragetrade/sdk";

export function parseAddress(input: any, paramName: string): string {
  if (!isAddress(input)) {
    throwInvalidInputError(paramName);
  }
  return getAddress(input);
}

export function parseString(input: any, paramName: string): string {
  if (typeof input !== "string") {
    throwInvalidInputError(paramName);
  }
  return input;
}

export function parseInteger(input: any, paramName: string): number {
  input = parseInt(input);
  if (typeof input !== "number" || !Number.isInteger(input)) {
    throwInvalidInputError(paramName);
  }
  return input;
}

export function parseNetworkName(input: any): NetworkName {
  const str = parseString(input, "networkName");
  if (!["arbmain", "arbtest"].includes(str)) {
    throw new ErrorWithStatusCode(
      'networkName must be "arbmain" or "arbtest"',
      400
    );
  }

  return str as NetworkName;
}

export class ErrorWithStatusCode extends Error {
  status: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.status = statusCode;
  }
}

export function throwInvalidInputError(name: string, type?: string) {
  const error = new ErrorWithStatusCode(
    `Invalid ${type ?? "value"} passed for ${name}`,
    400
  );
  throw error;
}

export function handleRuntimeErrors(
  fn: express.RequestHandler
): express.RequestHandler {
  return async (req, res, next) => {
    try {
      const result = await fn(req, res, next);
      res.json({ result });
    } catch (e: any) {
      next(createError(e.status ?? 500, e.message));
    }
  };
}
