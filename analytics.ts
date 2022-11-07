import { JsonStore } from "./store/json-store";

interface UrlInfo {
  hits: number;
}

export class Analytics {
  tempKeyCount: number = 0;
  temp: { [key: string]: UrlInfo | undefined } = {};
  storing: boolean = false;

  recordUrlVisit(url: string) {
    if (this.temp[url] === undefined) {
      this.tempKeyCount++;
      if (this.tempKeyCount > 1_000) {
        // this might likely be an attack, so stop analytics
        return;
      }
      this.temp[url] = { hits: 0 };
    }
    this.temp[url]!.hits += 1;
  }

  async storeTemp() {
    if (this.storing) return;

    this.storing = true;
    const store = new JsonStore(`data/_analytics/${date()}.json`, true);

    const entries = Object.entries(this.temp);
    this.temp = {};
    const resultArray: (UrlInfo | undefined)[] =
      await store._getMultiple<UrlInfo>(entries.map((e) => e[0]));

    for (let i = 0; i < resultArray.length; i++) {
      const result = resultArray[i];
      const key = entries[i][0];
      const value = entries[i][1]!;
      if (result === undefined) {
        resultArray[i] = value;
        await store.set(key, value);
      } else {
        // merge data
        result.hits += value.hits;
      }
    }

    await store._setMultiple(
      entries.map((entry, i) => ({ key: entry[0], value: resultArray[i] }))
    );
    this.storing = false;
  }
}

export function date() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
