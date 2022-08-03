export interface Internal {
  [key: string]: string;
}

export class BaseStore<Value> {
  async getInternal(_key: string): Promise<string | undefined> {
    throw new Error("BaseStore.getInternal: method not implemented.");
  }

  async setInternal(_key: string, _value: string): Promise<void> {
    throw new Error("BaseStore.setInternal: method not implemented.");
  }

  async getOrSetInternal(_key: string, _value: string): Promise<string> {
    throw new Error("BaseStore.getOrSetInternal: method not implemented.");
  }

  async get(_key: string): Promise<Value | undefined> {
    throw new Error("BaseStore.get: method not implemented.");
  }

  async set(_key: string, _value: Value): Promise<void> {
    throw new Error("BaseStore.set: method not implemented.");
  }

  async getOrSet(_key: string, _value: Value): Promise<Value> {
    throw new Error("BaseStore.getOrSet: method not implemented.");
  }
}
