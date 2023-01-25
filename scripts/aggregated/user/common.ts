import { Entry } from "../util/types";
import { UserSharesEntry, UserSharesResult } from "./shares";

export function matchWithUserShares(
  userSharesResult: UserSharesResult,
  mainEntry: Entry<any>,
  userSharesEntry: UserSharesEntry,
  _mi: number,
  ui: number
) {
  const userSharesEntryNext = userSharesResult.data[ui + 1];
  return userSharesEntryNext !== undefined
    ? userSharesEntry.blockNumber <= mainEntry.blockNumber &&
        mainEntry.blockNumber < userSharesEntryNext.blockNumber
    : true;
}
