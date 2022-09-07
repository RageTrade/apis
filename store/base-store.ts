export interface Internal {
  [key: string]: string;
}

export class BaseStore<Value> {
  // async getInternal(_key: string): Promise<string | undefined> {
  //   throw new Error("BaseStore.getInternal: method not implemented.");
  // }

  // async setInternal(_key: string, _value: string): Promise<void> {
  //   throw new Error("BaseStore.setInternal: method not implemented.");
  // }

  // async getOrSetInternal(_key: string, _value: string): Promise<string> {
  //   throw new Error("BaseStore.getOrSetInternal: method not implemented.");
  // }

  async get<V = Value>(_key: string): Promise<V | undefined> {
    throw new Error("BaseStore.get: method not implemented.");
  }

  async set<V = Value>(_key: string, _value: V): Promise<void> {
    throw new Error("BaseStore.set: method not implemented.");
  }

  async getOrSet<V = Value>(_key: string, _value: V): Promise<V> {
    throw new Error("BaseStore.getOrSet: method not implemented.");
  }
}
