import { ethers } from "ethers";

import { NetworkName } from "@ragetrade/sdk";

export type EventFn<Event> = (
  networkName: NetworkName,
  provider: ethers.providers.Provider
) => Event[] | Promise<Event[]>;

export async function parallelize<Data, Event extends ethers.Event>(
  options: {
    networkName: NetworkName;
    provider: ethers.providers.Provider;
    getEvents: EventFn<Event> | [EventFn<Event>];
    ignoreMoreEventsInSameBlock?: boolean;
    startBlockNumber?: number;
  },
  onEachEvent: (_i: number, blockNumber: number, event: Event) => Promise<Data>
): Promise<Data[]>;

export async function parallelize<Data>(
  options: {
    networkName: NetworkName;
    provider: ethers.providers.Provider;
    getEvents: EventFn<ethers.Event>[];
    ignoreMoreEventsInSameBlock?: boolean;
    startBlockNumber?: number;
  },
  onEachEvent: (
    _i: number,
    blockNumber: number,
    event: ethers.Event
  ) => Promise<Data>
): Promise<Data[]>;

export async function parallelize<Data, Event extends ethers.Event>(
  options: {
    networkName: NetworkName;
    provider: ethers.providers.Provider;
    getEvents: EventFn<Event> | EventFn<Event>[];
    ignoreMoreEventsInSameBlock?: boolean;
    startBlockNumber?: number;
  },
  onEachEvent: (_i: number, blockNumber: number, event: Event) => Promise<Data>
) {
  const {
    networkName,
    provider,
    getEvents,
    ignoreMoreEventsInSameBlock,
    startBlockNumber,
  } = options;

  let allEvents: Event[] = [];

  if (Array.isArray(getEvents)) {
    for (const fn of getEvents) {
      allEvents = allEvents.concat(await fn(networkName, provider));
    }
  } else {
    allEvents = await getEvents(networkName, provider);
  }

  allEvents = allEvents.sort((a, b) => a.blockNumber - b.blockNumber);

  if (startBlockNumber) {
    allEvents = allEvents.filter((e) => e.blockNumber >= startBlockNumber);
  }

  if (ignoreMoreEventsInSameBlock) {
    const blockMap = new Map<number, boolean>();
    allEvents = allEvents.filter(
      (event) =>
        !blockMap.has(event.blockNumber) &&
        blockMap.set(event.blockNumber, true)
    );
  }

  let data: Data[] = [];
  for (let i = 0; i < allEvents.length; i++) {
    data.push();
  }

  const start = Date.now();
  let i = 0;
  let promises = [];
  let inflight = 0;
  let done = 0;
  let failed = 0;
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
        let thisFailed = 0;
        while (1) {
          // add random delay to avoid lot of requests being shot at same time
          await new Promise((r) =>
            setTimeout(r, Math.floor(Math.random() * 10_000))
          );
          if (inflight >= (process.env.MAX_INFLIGHT_LOOPS ?? 100)) continue;
          try {
            inflight++;
            data[_i] = await onEachEvent(_i, blockNumber, event);
            done++;
            inflight--;
            break;
          } catch (e: any) {
            // console.log("retrying", e);
            failed++;
            thisFailed++;
            inflight--;

            if (failed > allEvents.length * 4) {
              throw e;
            }
            if (thisFailed > 4) {
              console.error(
                "thisFailed > 4",
                blockNumber,
                event.event ?? "",
                e
              );
            }
          }
        }
      })(
        i++,
        event.blockNumber,
        event.event ?? "",
        event.transactionHash,
        event.logIndex,
        event
      ).catch((e) => {
        throw e;
      })
    );
  }

  let intr = setInterval(() => {
    console.log(
      "inflight",
      inflight,
      "done",
      done,
      (done * 1000) / (Date.now() - start),
      "retries",
      failed,
      "total",
      allEvents.length
    );
  }, 5000);

  await Promise.all(promises);

  clearInterval(intr);
  return data;
}
