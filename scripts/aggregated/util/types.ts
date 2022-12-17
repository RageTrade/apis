export interface EntryBase {
  blockNumber: number;
  eventName: string;
  transactionHash: string;
  logIndex: number;
}

export type Entry<T extends { [key: string]: any }> = T & EntryBase;
