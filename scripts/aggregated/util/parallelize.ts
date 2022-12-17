import { ethers } from "ethers";

import { NetworkName } from "@ragetrade/sdk";

export async function parallelize<Data, Event extends ethers.Event>(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  getEvents: (
    networkName: NetworkName,
    provider: ethers.providers.Provider
  ) => Promise<Event[]>,
  onEachEvent: (
    _i: number,
    blockNumber: number,
    eventName: string,
    transactionHash: string,
    logIndex: number,
    event: Event
  ) => Promise<Data>
) {
  const allEvents = (await getEvents(networkName, provider)).sort(
    (a, b) => a.blockNumber - b.blockNumber
  );

  let data: Data[] = [];
  for (let i = 0; i < allEvents.length; i++) {
    data.push();
  }

  let i = 0;
  let promises = [];
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
            setTimeout(r, Math.floor(Math.random() * 20_000))
          );
          try {
            data[_i] = await onEachEvent(
              _i,
              blockNumber,
              eventName,
              transactionHash,
              logIndex,
              event
            );
            done++;
            break;
          } catch (e: any) {
            // console.log("retrying", e);
            failed += 1;

            if (failed > allEvents.length * 1.5) {
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
      )
    );
  }

  let intr = setInterval(() => {
    console.log("done", done, "retries", failed, "total", allEvents.length);
  }, 5000);

  await Promise.all(promises);

  clearInterval(intr);
  return data;
}
