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

  async get(key: string): Promise<Value> {
    const json = await readJSON(this._path);
    return json[key];
  }

  async set(key: string, value: Value): Promise<void> {
    const json = await readJSON(this._path);
    json[key] = value;
    await writeJSON(this._path, json, { spaces: 2 });
  }

  async getOrSet(key: string, value: Value): Promise<Value> {
    const read = await this.get(key);
    if (read !== undefined) {
      return read;
    } else {
      await this.set(key, value);
      return value;
    }
  }

  async getInternal(key: string): Promise<string | undefined> {
    const internal = ((await this.get("_internal")) ??
      {}) as unknown as Internal;
    return internal[key];
  }

  async setInternal(key: string, value: string): Promise<void> {
    const internal = ((await this.get("_internal")) ??
      {}) as unknown as Internal;
    internal[key] = value;
    await this.set(
      "_internal",
      // @ts-ignore
      internal
    );
  }

  async getOrSetInternal(key: string, value: string): Promise<string> {
    const read = await this.getInternal(key);
    if (read !== undefined) {
      return read;
    } else {
      await this.setInternal(key, value);
      return value;
    }
  }
}
