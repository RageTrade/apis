import { BaseStore } from "./base-store";

export class JsonStore<Value> extends BaseStore<Value> {
  _state: { [key: string]: Value } = {};

  async _get<V = Value>(key: string): Promise<V> {
    return this._state[key] as unknown as V;
  }

  async _set<V = Value>(key: string, value: V): Promise<void> {
    this._state[key] = value as unknown as Value;
  }
}
