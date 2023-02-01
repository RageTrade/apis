import { createFileSync, existsSync, readJSON, writeJSONSync } from 'fs-extra'

import { BaseStore } from './base-store'

export class JsonStore<Value> extends BaseStore<Value> {
  _path: string
  _reading: number
  _writing: boolean

  constructor(path: string, noTimestamp = false) {
    super()
    this._path = path
    if (!existsSync(this._path)) {
      createFileSync(this._path)
      writeJSONSync(this._path, {}, { spaces: 2 })
    }
    if (noTimestamp) {
      this._timestampPrepend = ''
    }
    this._reading = 0
    this._writing = false
  }

  async _readJson() {
    this._reading++
    let json
    while (true) {
      try {
        // if writing is in progress, read might fail
        json = await readJSON(this._path)
        break
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 10)) // wait for 10 ms
    }
    this._reading--
    return json
  }

  async _writeJson(entries: Array<{ key: string; value: any }>) {
    await this.waitForWrite()
    this._writing = true
    await this.waitForReads()
    const json = await this._readJson()
    for (const { key, value } of entries) {
      json[key] = value
    }
    // TODO find what is the best way to handle this
    // json files get overwritten occasionally
    await writeJSONSync(this._path, json, { spaces: 2 })
    this._writing = false
  }

  async waitForReads() {
    while (this._reading > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5)) // wait for 5 ms
    }
  }

  async waitForWrite() {
    while (this._writing) {
      await new Promise((resolve) => setTimeout(resolve, 5)) // wait for 5 ms
    }
  }

  async _get<V = Value>(key: string): Promise<V> {
    const json = await this._readJson()
    return json[key]
  }

  async _set<V = Value>(key: string, value: V): Promise<void> {
    this._writeJson([{ key, value }])
  }

  async _getMultiple<V = Value>(keys: string[]): Promise<V[]> {
    const json = await this._readJson()
    return keys.map((key) => json[key])
  }

  async _setMultiple<V = Value>(
    entries: Array<{ key: string; value: V }>
  ): Promise<void> {
    await this._writeJson(entries)
  }
}
