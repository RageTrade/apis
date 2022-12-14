import { getAddress, isAddress } from "ethers/lib/utils";
import express from "express";
import createError from "http-errors";
import { Request } from "express";

import {
  NetworkName,
  VaultName,
  getNetworkName as getNetworkNameSdk,
  getVaultName as getVaultNameSdk,
} from "@ragetrade/sdk";
import { BigNumber, ethers } from "ethers";

export const secs = 1;
export const mins = 60;
export const hours = 60 * mins;
export const days = 24 * hours;

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
  return getNetworkNameSdk(str as NetworkName);
}

export function getVaultName(req: Request): VaultName {
  const str = getParamAsString(req, "vaultName");
  return getVaultNameSdk(str as VaultName);
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
      let response = (await fn(req, res, next)) as any;
      if (response.error) {
        response.error = removeApiKeysFromString(
          typeof response.error === "string"
            ? response.error
            : response.error?.message
        );
      } else if (!response.result) {
        // TODO improve types
        throw new Error(
          'There was no error but function did not return a "result" value'
        );
      }
      let status = 200; // success
      if (response.error) {
        status = 500; // internal server error
      }
      if (typeof response.status === "number") {
        status = response.status;
      }
      res.status(status).json(response);
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
  if (!msg) return msg;
  const apiKeys = [
    process.env.ALCHEMY_KEY,
    process.env.INFURA_KEY,
    process.env.ARBISCAN_KEY,
  ].filter((v) => !!v) as string[];
  let prevLength = msg.length;

  for (const apiKey of apiKeys) {
    do {
      prevLength = msg.length;
      msg = msg.replace(apiKey, "<api-key-redacted>");
    } while (msg.length !== prevLength);
  }
  return msg;
}

export function currentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

export function safeDiv(numerator: BigNumber, denominator: BigNumber) {
  return denominator.eq(0) ? ethers.constants.Zero : numerator.div(denominator);
}

export function safeDivNumer(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function timestampRoundDown(timestampSec: number) {
  return timestampSec - (timestampSec % days);
}
