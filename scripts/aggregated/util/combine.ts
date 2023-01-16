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
  matcher: (a: A, b: B, aIndex: number, bIndex: number) => boolean,
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
