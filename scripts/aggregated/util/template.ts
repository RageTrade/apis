import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";
import { ethers } from "ethers";

export async function parallelizeOverEveryDWR<Data>(
  networkName: NetworkName,
  provider: ethers.providers.Provider,
  onEachEvent: (
    _i: number,
    blockNumber: number,
    eventName: string,
    transactionHash: string,
    logIndex: number,
    event: ethers.Event
  ) => Promise<Data>
) {
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const allDepositEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Deposit()
  );
  const allWithdrawEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Withdraw()
  );
  const allRebalancedEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Rebalanced()
  );
  const allEvents = [
    ...allDepositEvents,
    ...allWithdrawEvents,
    ...allRebalancedEvents,
  ].sort((a, b) => a.blockNumber - b.blockNumber);

  let data: Data[] = [];
  for (let i = 0; i < allEvents.length; i++) {
    data.push();
  }

  let i = 0;
  let promises = [];
  let done = 0;
  let failed = 0;
  for (const event of allEvents) {
    if (i > 200) break;
    promises.push(
      (async (
        _i: number,
        blockNumber: number,
        eventName: string,
        transactionHash: string,
        logIndex: number,
        event: ethers.Event
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
            // console.log("retrying");
            failed += 1;
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
    console.log("done", done, "retries", failed);
  }, 5000);

  await Promise.all(promises);

  clearInterval(intr);
  return data;
}
