import { ethers } from "ethers";
import { retryRequest } from "./utils";

/**
 * Sometimes requests fail with ECONNRESET. This provider retries them after random time.
 */
export class RetryProvider extends ethers.providers.StaticJsonRpcProvider {
  async send(method: string, params: Array<any>): Promise<any> {
    return await retryRequest(() => super.send(method, params), {
      maxRetries: 5,
      name: method,
    });
  }
}
