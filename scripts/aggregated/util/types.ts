export interface EntryBase {
  blockNumber: number
  transactionHash?: string
  eventName?: string
  logIndex?: number
}

export type Entry<T extends { [key: string]: any }> = T & EntryBase
