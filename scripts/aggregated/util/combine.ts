import { EntryBase } from "./types";

/**
 * Gives intersection of two data arrays through blockNumber & logIndex, mixes
 * @param a
 * @param b
 * @returns
 */
export function combine<
  A extends EntryBase,
  B extends EntryBase,
  Combiner extends (a: A, b: B, aIndex: number, bIndex: number) => any
>(
  a: A[],
  b: B[],
  matcher: (
    a: EntryBase,
    b: EntryBase,
    aIndex: number,
    bIndex: number
  ) => boolean,
  combiner: Combiner
): ReturnType<Combiner>[] {
  const combined: ReturnType<Combiner>[] = [];

  for (let aIndex = 0; aIndex < a.length; aIndex++) {
    for (let bIndex = 0; bIndex < b.length; bIndex++) {
      if (matcher(a[aIndex], b[bIndex], aIndex, bIndex)) {
        combined.push(combiner(a[aIndex], b[bIndex], aIndex, bIndex));
        break;
      }
    }
  }

  return combined;
}

export function intersection<
  A extends EntryBase,
  B extends EntryBase,
  Combiner extends (a: A, b: B) => any
>(a: A[], b: B[], combiner: Combiner): ReturnType<Combiner>[] {
  return combine(
    a,
    b,
    // require block number and log index if it exists to be same
    (aItem, bItem) =>
      aItem.blockNumber === bItem.blockNumber &&
      // if log index exists then check that as well
      (!!aItem.logIndex && !!bItem.logIndex
        ? aItem.logIndex === bItem.logIndex
        : true),
    combiner
  );
}

export function combineNonOverlappingEntries<
  A extends EntryBase,
  B extends EntryBase,
  Combiner extends (a: A, b: B) => any
>(a: A[], b: B[], combiner: Combiner): ReturnType<Combiner>[] {
  return combine(a, b, matchWithNonOverlappingEntries.bind(null, b), combiner);
}

/**
 * Matches main entry with an other entry that is the closest and comes just before.
 *
 * Many-to-one mapping from main entry to other entry.
 *
 * Total number of matches is equal to number of main entries.
 *
 * This basically assumes that other entry holds it's value from
 * otherEntry.blockNumber to otherEntryNext.blockNumber - 1
 * e.g. user shares
 *
 * If there are multiple other entries in same block then only matches the latest.
 *
 * @param otherEntries array of user balances
 * @param mainEntry main entry
 * @param otherEntry user balance entry
 * @param mi index of main entry
 * @param oi index of other entry
 * @returns true if match
 */
export function matchWithNonOverlappingEntries(
  otherEntries: EntryBase[],
  mainEntry: EntryBase,
  otherEntry: EntryBase,
  _mi: number,
  oi: number
) {
  // TODO there is a chance that subgraph could be out of sync with blockchain,
  // so somehow add a way to allow expanding `otherEntries` to account for that?
  const otherEntryNext =
    oi < otherEntries.length - 1 ? otherEntries[oi + 1] : undefined;

  console.log(
    "matchWithNonOverlappingEntries",
    _mi,
    oi,
    mainEntry.blockNumber,
    otherEntry.blockNumber,
    otherEntryNext?.blockNumber,
    mainEntry.blockNumber >= otherEntry.blockNumber,
    otherEntryNext !== undefined
      ? mainEntry.blockNumber < otherEntryNext.blockNumber
      : true
  );

  return (
    mainEntry.blockNumber >= otherEntry.blockNumber &&
    (otherEntryNext !== undefined
      ? mainEntry.blockNumber < otherEntryNext.blockNumber
      : true)
  );
}

export function addNullEntry<E extends EntryBase>(
  otherEntries: E[],
  nullEntry: E
): E[] {
  // if null entry is present don't add
  if (otherEntries.length > 0 && otherEntries[0].blockNumber === 0) {
    return otherEntries;
  }

  return [nullEntry, ...otherEntries];
}
