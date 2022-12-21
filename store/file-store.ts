import { readJSON, writeJSON, existsSync, ensureFile, remove } from "fs-extra";
import path from "path";
import { BaseStore } from "./base-store";

export class FileStore<Value> extends BaseStore<Value> {
  _dirPath: string;
  constructor(dirPath: string) {
    super();
    this._dirPath = dirPath;
    this._timestampPrepend = "";
  }

  async _get<V = string>(_key: string): Promise<V | undefined> {
    const filePath = this.getPath(_key);
    const exists = existsSync(filePath);
    if (exists) {
      try {
        const json = await readJSON(filePath);
        return json as unknown as V;
      } catch {
        await remove(filePath);
      }
    }
    return undefined;
  }

  async _set<V = Value>(_key: string, _value: V): Promise<void> {
    await ensureFile(this.getPath(_key));
    await writeJSON(this.getPath(_key), _value);
  }

  getPath(key: string) {
    return path.resolve(this._dirPath, "key-" + key + ".json");
  }
}
