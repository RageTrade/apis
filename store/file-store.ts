import {
  readJSON,
  writeJSON,
  existsSync,
  ensureFileSync,
  ensureFile,
} from "fs-extra";
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
    const exists = existsSync(this.getPath(_key));
    if (exists) {
      const json = await readJSON(this.getPath(_key));
      return json as unknown as V;
    } else {
      return undefined;
    }
  }

  async _set<V = Value>(_key: string, _value: V): Promise<void> {
    await ensureFile(this.getPath(_key));
    await writeJSON(this.getPath(_key), _value);
  }

  getPath(key: string) {
    return path.resolve(this._dirPath, "key-" + key + ".json");
  }
}
