import { BaseStore } from "./base-store";

declare global {
  var __memory_store: { [id: string]: { [key: string]: any } };
}

globalThis["__memory_store"] = globalThis["__memory_store"] || {};

export class MemoryStore<Value> extends BaseStore<Value> {
  _state: { [key: string]: Value };

  constructor(id: string) {
    super();
    globalThis["__memory_store"][id] = globalThis["__memory_store"][id] || {};
    this._state = globalThis["__memory_store"][id]; // set reference to global state
  }

  async _get<V = Value>(key: string): Promise<V> {
    return this._state[key] as unknown as V;
  }

  async _set<V = Value>(key: string, value: V): Promise<void> {
    this._state[key] = value as unknown as Value;
  }
}
