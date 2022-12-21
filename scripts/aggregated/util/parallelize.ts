import { ethers } from "ethers";

import { NetworkName } from "@ragetrade/sdk";

export type EventFn<Event> = (
  networkName: NetworkName,
  provider: ethers.providers.Provider
) => Event[] | Promise<Event[]>;

export async function parallelize<Data, Event extends ethers.Event>(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  getEvents: EventFn<Event> | EventFn<Event>[],
  onEachEvent: (
    _i: number,
    blockNumber: number,
    eventName: string,
    transactionHash: string,
    logIndex: number,
    event: Event
  ) => Promise<Data>
) {
  let allEvents: Event[] = [];

  if (Array.isArray(getEvents)) {
    for (const fn of getEvents) {
      allEvents = allEvents.concat(await fn(networkName, provider));
    }
  } else {
    allEvents = await getEvents(networkName, provider);
  }

  allEvents = allEvents.sort((a, b) => a.blockNumber - b.blockNumber);

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
        while (1) {
          // add random delay to avoid lot of requests being shot at same time
          await new Promise((r) =>
            setTimeout(r, Math.floor(Math.random() * 10_000))
          );
          if (inflight >= 700) continue;
          try {
            inflight++;
            data[_i] = await onEachEvent(
              _i,
              blockNumber,
              eventName,
              transactionHash,
              logIndex,
              event
            );
            done++;
            inflight--;
            break;
          } catch (e: any) {
            // console.log("retrying", e);
            failed++;
            inflight--;

            if (failed > allEvents.length * 4) {
              throw e;
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
