import type { NetworkName } from '@ragetrade/sdk'
import type { ethers } from 'ethers'
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils'

import { ENV } from '../../../env'
import { getRedisClient } from '../../../redis-utils/get-client'
import { currentTimestamp } from '../../../utils'

const redis = getRedisClient()

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

  await updateProgress(label, 'fresh', 'started')

  let allEvents: Event[] = []

  if (Array.isArray(getEvents)) {
    for (const [i, _getEvents] of getEvents.entries()) {
      await updateProgress(label, 'update', `querying events bucket ${i}`)
      const events = await _getEvents(
        networkName,
        provider,
        startBlockNumber,
        endBlockNumber
      )
      allEvents = allEvents.concat(events)
    }
  } else {
    await updateProgress(label, 'update', `querying single event bucket`)
    allEvents = await getEvents(networkName, provider, startBlockNumber, endBlockNumber)
  }

  await updateProgress(label, 'update', `all events are queried`)

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
  // TODO get these inline constant prepends in a file and import here
  const key = `parallelize-fingerprint-${fingerprint}`

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

  await updateProgress(label, 'update', `starting query`)

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
  let lastDoneTotal = 0
  let doneArray: number[] = [] // stores number of resolved promises in every 5 seconds
  const SLAB = Math.max(Math.floor(allEvents.length / 100), 10)
  function getLastDone(currentDoneTotal: number) {
    let thisDone = currentDoneTotal - lastDoneTotal
    lastDoneTotal = currentDoneTotal
    doneArray.push(thisDone)

    let count = 0
    let time = 0
    for (let i = doneArray.length - 1; i >= 0; i--) {
      const thatDone = doneArray[i]
      count += thatDone
      time += 5
      if (count >= SLAB) {
        break
      }
    }
    if (count < SLAB) {
      time = Math.floor((Date.now() - start) / 1000)
    }
    return {
      count,
      time
    }
  }

  const intr = setInterval(() => {
    const lastDone = getLastDone(done)
    const speed = Number((lastDone.count / lastDone.time).toFixed(3)) // events per sec
    const eta = (allEvents.length - done) / speed
    console.info(
      'retries',
      failed,
      'inflight',
      inflight,
      'total',
      allEvents.length,
      'done',
      done,
      'speed',
      speed,
      'eta',
      Math.floor(eta),
      `( ${label} )`
    )

    redisPromise = redis.set(key, JSON.stringify(oldData)).then(() =>
      updateProgress(label, 'update', `interval`, {
        retries: failed,
        inflight,
        total: allEvents.length,
        done,
        speed
      })
    )
  }, 5000)

  await Promise.all(promises)

  clearInterval(intr)
  await redisPromise
  const finalResult = data.filter((d) => !!d) as Data[]
  await redis.set(key, JSON.stringify(finalResult))
  await updateProgress(label, 'end', `finished`)
  return finalResult
}

interface ProgressUpdate {
  label: string
  description: string
  startTime: number
  updateTime: number
  endTime: number
  currentProgress: {
    retries: number
    inflight: number
    total: number
    done: number
    speed: number
  }
}

async function updateProgress(
  label: string,
  type: 'fresh' | 'update' | 'end',
  description: string,
  currentProgress?: ProgressUpdate['currentProgress']
) {
  // TODO get these inline constant prepends in a file
  const progressKey = `parallelize-progress-${label}`
  const str = await redis.get(progressKey)
  let progress: ProgressUpdate
  if (type === 'fresh' || !isProgressUpdate(str)) {
    progress = {
      label,
      description,
      startTime: currentTimestamp(),
      updateTime: currentTimestamp(),
      endTime: -1,
      currentProgress: {
        retries: 0,
        inflight: 0,
        total: 0,
        done: 0,
        speed: 0
      }
    }
  } else if (type === 'update') {
    progress = JSON.parse(str)
    if (currentProgress === undefined) {
      currentProgress = {
        retries: 0,
        inflight: 0,
        total: 0,
        done: 0,
        speed: 0
      }
    }
    progress.updateTime = currentTimestamp()
    progress.description = description
    progress.currentProgress = currentProgress
  } else if (type === 'end') {
    progress = JSON.parse(str)
    progress.description = description
    progress.updateTime = currentTimestamp()
    progress.endTime = currentTimestamp()
  } else {
    throw new Error('unknown type in updateProgress: ' + JSON.stringify(type))
  }
  await redis.set(progressKey, JSON.stringify(progress))

  function isProgressUpdate(redisResp: string | null): redisResp is string {
    let val = null
    try {
      val = JSON.parse(redisResp ?? '')
    } catch {}

    return (
      val !== null &&
      typeof val === 'object' &&
      typeof val.label === 'string' &&
      typeof val.description === 'string' &&
      typeof val.startTime === 'number' &&
      typeof val.updateTime === 'number' &&
      typeof val.endTime === 'number' &&
      typeof val.currentProgress === 'object' &&
      typeof val.currentProgress.retries === 'number' &&
      typeof val.currentProgress.inflight === 'number' &&
      typeof val.currentProgress.total === 'number' &&
      typeof val.currentProgress.done === 'number' &&
      typeof val.currentProgress.speed === 'number'
    )
  }
}
