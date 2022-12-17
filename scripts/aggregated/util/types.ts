export interface DataBase {
  blockNumber: number;
  logIndex: number;
}

export type Data<T extends { [key: string]: any }> = T & DataBase;
