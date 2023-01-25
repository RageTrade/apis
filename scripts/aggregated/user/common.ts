import { Entry } from "../util/types";
import { UserSharesEntry, UserSharesResult } from "./shares";

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
 * @param ui index of user balance entry
 * @returns true if match
 */
export function matchWithNonOverlappingEntries(
  otherEntries: Entry<any>[],
  mainEntry: Entry<any>,
  otherEntry: Entry<any>,
  _mi: number,
  ui: number
) {
  // TODO there is a chance that subgraph could be out of sync with blockchain,
  // so somehow add a way to allow expanding `otherEntries` to account for that?
  const otherEntryNext =
    ui < otherEntries.length - 1 ? otherEntries[ui + 1] : undefined;

  return (
    mainEntry.blockNumber >= otherEntry.blockNumber &&
    (otherEntryNext !== undefined
      ? otherEntryNext.blockNumber < mainEntry.blockNumber
      : true)
  );
}
