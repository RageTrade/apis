import 'isomorphic-unfetch'

import type { NetworkName, VaultName } from '@ragetrade/sdk'
import {
  getNetworkName as getNetworkNameSdk,
  getVaultName as getVaultNameSdk
} from '@ragetrade/sdk'
import type { BigNumber, EventFilter } from 'ethers'
import { ethers } from 'ethers'
import { fetchJson, getAddress, isAddress } from 'ethers/lib/utils'
import type express from 'express'
import type { Request } from 'express'
import createError from 'http-errors'

import { ENV } from './env'

export const secs = 1
export const mins = 60
export const hours = 60 * mins
export const days = 24 * hours
export const years = 365 * days

export function getParamAsAddress(req: Request, paramName: string): string {
  const input = getParamAsString(req, paramName)
  if (!isAddress(input)) {
    throw invalidInputError({ paramName, type: 'Address', value: input })
  }
  return getAddress(input)
}

export function getParamAsNumber(req: Request, paramName: string): number {
  const input = getParamAsString(req, paramName)
  const parsed = parseInt(input)
  if (isNaN(parsed)) {
    throw invalidInputError({ paramName, type: 'Number', value: input })
  }
  return parsed
}

export function getParamAsInteger(req: Request, paramName: string): number {
  const input = getParamAsNumber(req, paramName)
  if (!Number.isInteger(input)) {
    throw invalidInputError({ paramName, type: 'Integer', value: input })
  }
  return input
}

export function getNetworkName(req: Request): NetworkName {
  const str = getParamAsString(req, 'networkName')
  return getNetworkNameSdk(str as NetworkName)
}

export function getVaultName(req: Request): VaultName {
  const str = getParamAsString(req, 'vaultName')
  return getVaultNameSdk(str as VaultName)
}

export function getParamAsString(req: Request, paramName: string): string {
  const input = getParam(req, paramName)
  if (typeof input !== 'string') {
    throw invalidInputError({ paramName, value: input, type: 'string' })
  }
  return input
}

export function getExcludeRawData(req: Request): boolean {
  return getOptionalParamAsBoolean(req, 'excludeRawData', false)
}

export function getOptionalParamAsBoolean(
  req: Request,
  paramName: string,
  defaultValue: boolean
): boolean {
  const input = getParam(req, paramName, false)
  return !!(input ?? defaultValue)
}

export function getParam(req: Request, paramName: string, required = true) {
  const input = req.query[paramName]
  if (required && input === undefined) {
    throw new ErrorWithStatusCode(
      `"${paramName}" param is required but not provided`,
      400
    )
  }
  return input
}

export class ErrorWithStatusCode extends Error {
  status: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.status = statusCode
  }
}

export function invalidInputError(opts: {
  paramName: string
  type?: string
  value?: any
}) {
  const error = new ErrorWithStatusCode(
    `Invalid ${opts.type ?? 'value'} ${
      opts.value ? `(${String(opts.value)}) ` : ''
    }passed for ${opts.paramName}`,
    400
  )
  return error
}

export function handleRuntimeErrors(fn: express.RequestHandler): express.RequestHandler {
  return async (req, res, next) => {
    try {
      const response = (await fn(req, res, next)) as any
      if (response.error) {
        response.error = removeApiKeysFromString(
          typeof response.error === 'string' ? response.error : response.error?.message
        )
      } else if (!response.result) {
        // TODO improve types
        throw new Error('There was no error but function did not return a "result" value')
      }
      let status = 200 // success
      if (response.error) {
        status = 500 // internal server error
      }
      if (typeof response.status === 'number') {
        status = response.status
      }
      res.status(status).json(response)
    } catch (e: any) {
      if (e instanceof TypeError) {
        console.error('caught in handleRuntimeErrors', e)
      }
      next(createError(e.status ?? 500, removeApiKeysFromString(e.message)))
    }
  }
}

export async function retry<R>(fn: () => R | Promise<R>, failedValue?: R): Promise<R> {
  const delay = 2000
  let lastError: any
  let i = 3
  while (i--) {
    try {
      const res = await fn()
      return res
    } catch (e) {
      lastError = e
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  if (failedValue === undefined) {
    throw lastError
  } else {
    return failedValue
  }
}

export async function retryRequest<R>(
  fn: () => R | Promise<R>,
  options: { errorKeywords?: string[]; name?: string; maxRetries?: number } = {}
): Promise<R> {
  options.errorKeywords = [
    'socket hang up',
    'ECONNRESET',
    'TIMEOUT',
    'ETIMEDOUT',
    'EADDRNOTAVAIL',
    ...(options.errorKeywords ?? [])
  ]

  options.maxRetries = options.maxRetries ?? 5
  const delay: number = Math.floor(Math.random() * 2000)

  let lastError: any

  for (let i = 0; i < options.maxRetries; i++) {
    try {
      const result = await fn()
      if (i > 0) {
        console.error(`retryRequest: ${options.name}: Success after ${i} retries`)
      }
      return result
    } catch (e: any) {
      const errorKeyword = options.errorKeywords.find((ek) =>
        JSON.stringify(e).includes(ek)
      )
      if (errorKeyword) {
        // this is likely a temporary error, so it's worth retrying in 0 to 2 sec
        console.error(
          `retryRequest: ${options.name}: ${errorKeyword} at time ${String(
            new Date()
          )}, retrying ${i}: ${options.name}`
        )
        await new Promise((res) => setTimeout(res, delay))
        lastError = e
        continue
      } else {
        // we don't think this is a temporary error, so lets fail immediately
        throw e
      }
    }
  }
  // if we get here, we've retried 5 times and so lets fail
  throw lastError
}

export async function fetchRetry(input: string, init?: RequestInit | undefined) {
  return retryRequest(async () => fetch(input, init), {
    name: String(input)
  })
}

export async function fetchJsonRetry(input: string) {
  return retryRequest(async () => fetchJson(input), {
    name: String(input)
  })
}

export function removeApiKeysFromString(msg: string): string {
  if (!msg) return msg
  const apiKeys = [ENV.ALCHEMY_KEY, ENV.ALCHEMY_KEY_AGGREGATE, ENV.ARBISCAN_KEY]

  let prevLength = msg.length

  for (const apiKey of apiKeys) {
    do {
      prevLength = msg.length
      msg = msg.replace(apiKey, '<api-key-redacted>')
    } while (msg.length !== prevLength)
  }
  return msg
}

export function currentTimestamp() {
  return Math.floor(Date.now() / 1000)
}

export function safeDiv(numerator: BigNumber, denominator: BigNumber) {
  return denominator.eq(0) ? ethers.constants.Zero : numerator.div(denominator)
}

export function safeDivNumer(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator
}

export function timestampRoundDown(timestampSec: number) {
  return timestampSec - (timestampSec % days)
}

export async function getLogs(
  filter: EventFilter,
  fromBlock: number,
  toBlock: number,
  provider: ethers.providers.Provider,
  networkName: NetworkName
) {
  let logs: ethers.providers.Log[] | undefined

  let _fromBlock = fromBlock
  let _toBlock = toBlock
  let _fetchedBlock = fromBlock - 1

  while (_fetchedBlock < toBlock) {
    try {
      console.log(networkName, 'getLogs', _fromBlock, _toBlock)
      const _logs = await provider.getLogs({
        ...filter,
        fromBlock: _fromBlock,
        toBlock: _toBlock
      })
      logs = logs ? logs.concat(_logs) : _logs
      // setting fetched block to the last block of the fetched logs
      _fetchedBlock = _toBlock
      // next getLogs query range
      _fromBlock = _toBlock + 1
      _toBlock = toBlock
    } catch {
      // if query failed, re-try with a shorter block interval
      _toBlock = _fromBlock + Math.floor((_toBlock - _fromBlock) / 2)
      console.error(networkName, 'getLogs failed')
    }
  }

  if (!logs) {
    throw new Error('logs is undefined in getLogs')
  }

  return logs
}
