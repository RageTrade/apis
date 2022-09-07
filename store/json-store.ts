import { BaseStore, Internal } from "./base-store";
import {
  readJSON,
  writeJSON,
  writeJSONSync,
  createFileSync,
  existsSync,
} from "fs-extra";

export class JsonStore<Value> extends BaseStore<Value> {
  _path: string;

  constructor(path: string) {
    super();
    this._path = path;
    if (!existsSync(this._path)) {
      createFileSync(this._path);
      writeJSONSync(this._path, {}, { spaces: 2 });
    }
  }

  async _get<V = Value>(key: string): Promise<V> {
    const json = await readJSON(this._path);
    return json[key];
  }

  async _set<V = Value>(key: string, value: V): Promise<void> {
    const json = await readJSON(this._path);
    json[key] = value;
    await writeJSON(this._path, json, { spaces: 2 });
  }
}
