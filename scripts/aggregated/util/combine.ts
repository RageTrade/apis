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
  Combiner extends (a: A, b: B) => any
>(
  a: A[],
  b: B[],
  matcher: (a: A, b: B) => boolean,
  combiner: Combiner
): ReturnType<Combiner>[] {
  const combined: ReturnType<Combiner>[] = [];

  for (const aItem of a) {
    for (const bItem of b) {
      if (matcher(aItem, bItem)) {
        combined.push(combiner(aItem, bItem));
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
