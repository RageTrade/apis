import { ethers } from "ethers";

/**
 * Sometimes requests fail with ECONNRESET. This provider retries them after random time.
 */
export class RetryProvider extends ethers.providers.StaticJsonRpcProvider {
  async send(method: string, params: Array<any>): Promise<any> {
    for (let i = 0; i < 5; i++) {
      try {
        return await super.send(method, params);
      } catch (e: any) {
        if (e?.serverError?.code === "ECONNRESET") {
          // for ECONNRESET, wait for 0 to 2 sec and retry
          console.error(
            `ECONNRESET at time ${Date.now()}, retrying ${i}: ${method}`
          );
          await new Promise((res) =>
            setTimeout(res, Math.floor(Math.random() * 2000))
          );
          continue;
        } else {
          throw e;
        }
      }
    }
  }
}
