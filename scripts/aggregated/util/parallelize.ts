import type { NetworkName } from '@ragetrade/sdk'
import type { ethers } from 'ethers'
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils'

import { ENV } from '../../../env'
import { getRedisClient } from '../../../redis-utils/get-client'

export type EventFn<Event> = (
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  startBlockNumber?: number,
  endBlockNumber?: number
) => Event[] | Promise<Event[]>

export type OnEachEvent<Data, Event extends ethers.Event> = (
  _i: number,
  blockNumber: number,
  event: Event
) => Promise<Data | null | undefined>

export interface Options<T> {
  label: string
  networkName: NetworkName
  provider: ethers.providers.Provider
  getEvents: T
  ignoreMoreEventsInSameBlock?: boolean
  startBlockNumber?: number
  endBlockNumber?: number
}

export async function parallelize<Data, Event extends ethers.Event>(
  options: Options<EventFn<Event> | [EventFn<Event>]>,
  onEachEvent: OnEachEvent<Data, Event>
): Promise<Data[]>

export async function parallelize<Data>(
  options: Options<EventFn<ethers.Event>[]>,
  onEachEvent: OnEachEvent<Data, ethers.Event>
): Promise<Data[]>

export async function parallelize<Data, Event extends ethers.Event>(
  options: Options<EventFn<Event> | EventFn<Event>[]>,
  onEachEvent: OnEachEvent<Data, Event>
): Promise<Data[]> {
  const {
    label,
    networkName,
    provider,
    getEvents,
    ignoreMoreEventsInSameBlock,
    startBlockNumber,
    endBlockNumber
  } = options

  let allEvents: Event[] = []

  if (Array.isArray(getEvents)) {
    for (const _getEvents of getEvents) {
      const events = await _getEvents(
        networkName,
        provider,
        startBlockNumber,
        endBlockNumber
      )
      allEvents = allEvents.concat(events)
    }
  } else {
    allEvents = await getEvents(networkName, provider, startBlockNumber, endBlockNumber)
  }

  allEvents = allEvents.sort((a, b) => a.blockNumber - b.blockNumber)

  if (startBlockNumber) {
    allEvents = allEvents.filter((e) => e.blockNumber >= startBlockNumber)
  }
  if (endBlockNumber) {
    allEvents = allEvents.filter((e) => e.blockNumber <= endBlockNumber)
  }

  if (ignoreMoreEventsInSameBlock) {
    const blockMap = new Map<number, boolean>()
    allEvents = allEvents.filter(
      (event) => !blockMap.has(event.blockNumber) && blockMap.set(event.blockNumber, true)
    )
  }

  const data: (Data | null | undefined)[] = []
  for (let i = 0; i < allEvents.length; i++) {
    data.push()
  }

  // if source code stays the same, this fingerprint will not change and we can cache data
  const fingerprint = keccak256(toUtf8Bytes(onEachEvent.toString()))
  const key = `parallelize-fingerprint-${fingerprint}`

  const redis = getRedisClient()
  let oldData: any[] = []
  const temp = new Map<string, Data>()
  try {
    const value = await redis.get(key)
    oldData = value ? JSON.parse(value) : []
    // load a mapping indexed by event identifier, to make searching log N
    for (const entry of oldData) {
      temp.set(`${entry.blockNumber}-${entry.logIndex ?? 'none'}`, entry)
    }
  } catch {}

  const start = Date.now()
  let i = 0
  const promises = []
  let inflight = 0
  let done = 0
  let failed = 0
  for (const event of allEvents) {
    // if (i > 200) break;
    promises.push(
      (async (
        _i: number,
        blockNumber: number,
        eventName: string,
        transactionHash: string,
        logIndex: number,
        event: Event
      ) => {
        // check if this was already queried last time
        const cacheValue = await temp.get(`${blockNumber}-${logIndex ?? -1}`)
        if (cacheValue) {
          data[_i] = cacheValue
          return
        }
        // run for new events since previous queries would use cache
        // or if onEachEvent source code changed then run for every event
        let thisFailed = 0
        while (1) {
          // add random delay to avoid lot of requests being shot at same time
          await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 10_000)))
          if (inflight >= (ENV.MAX_INFLIGHT_LOOPS ?? 100)) continue
          try {
            inflight++
            let result = await onEachEvent(_i, blockNumber, event)
            if (result) {
              // do not allow metadata to be overriden
              const block = await provider.getBlock(blockNumber)
              result = {
                ...result,
                blockNumber,
                eventName,
                transactionHash,
                // logIndex // this is commented to keep logIndex optional
                timestamp: block.timestamp
              }
            }
            data[_i] = result
            oldData.push(result)
            done++
            inflight--
            break
          } catch (e: any) {
            // console.log("retrying", e);
            failed++
            thisFailed++
            inflight--

            if (failed > allEvents.length * 4) {
              throw e
            }
            if (thisFailed > 4) {
              console.error(
                'parallelize: thisFailed > 4',
                blockNumber,
                event.event ?? '',
                e
              )
            }
          }
        }
      })(
        i++,
        event.blockNumber,
        event.event ?? '',
        event.transactionHash,
        event.logIndex,
        event
      ).catch((e) => {
        throw e
      })
    )
  }

  let redisPromise: Promise<any> = new Promise((res) => res(null))
  const intr = setInterval(() => {
    console.info(
      'source',
      label,
      'retries',
      failed,
      'inflight',
      inflight,
      'total',
      allEvents.length,
      'done',
      done,
      'speed',
      ((done * 1000) / (Date.now() - start)).toFixed(3)
    )

    redisPromise = redis.set(key, JSON.stringify(oldData))
  }, 5000)

  await Promise.all(promises)

  clearInterval(intr)
  await redisPromise
  const finalResult = data.filter((d) => !!d) as Data[]
  await redis.set(key, JSON.stringify(finalResult))
  return finalResult
}

// async function parallelizeRequest<T>(
//   arr: () => Promise<T>,
//   maxInflight: number
// ) {
//   for (let i = 0; i < arr.length; i++) {
//     arr[i]()
//   }
// }
