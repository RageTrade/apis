import { DataBase } from "./types";

/**
 * Gives intersection of two data arrays through blockNumber & logIndex, mixes
 * @param a
 * @param b
 * @returns
 */
export function combine<
  A extends DataBase,
  B extends DataBase,
  Combiner extends (a: A, b: B) => any
>(a: A[], b: B[], combiner: Combiner): ReturnType<Combiner>[] {
  const combined: ReturnType<Combiner>[] = [];

  for (const aItem of a) {
    for (const bItem of b) {
      if (
        aItem.blockNumber === bItem.blockNumber &&
        aItem.logIndex === bItem.logIndex
      ) {
        combined.push(combiner(aItem, bItem));
        break;
      }
    }
  }

  return combined;
}
