import {
  BaseDataSource,
  EthersProviderDataSource,
  FallbackDataSource,
  MethodNames,
  NetworkName,
} from "@ragetrade/sdk";
import { getProvider } from "../../providers";
import { getAccountIdsByAddress } from "../get-account-ids-by-address";
import { getBlockByTimestamp } from "../get-block-by-timestamp";

// const arbmainDataSource = getDataSource("arbmain");
// const arbrinkebyDataSource = getDataSource("arbrinkeby");
// const arbgoerliDataSource = getDataSource("arbgoerli");

export function getDataSourceByNetworkName(networkName: NetworkName) {
  switch (networkName) {
    case "arbmain":
      return getDataSource("arbmain");
    case "arbrinkeby":
      return getDataSource("arbrinkeby");
    case "arbgoerli":
      return getDataSource("arbgoerli");
    default:
      throw new Error(`Unknown network name: ${networkName}`);
  }
}

function getDataSource(networkName: NetworkName) {
  return new FallbackDataSource([
    new InternalDataSource(networkName),
    new EthersProviderDataSource(getProvider(networkName)),
  ]);
}

export class InternalDataSource extends BaseDataSource {
  networkName: NetworkName;
  constructor(networkName: NetworkName) {
    super();
    this.networkName = networkName;
  }
  async getNetworkName(): Promise<NetworkName> {
    return this.networkName;
  }
  async getBlockByTimestamp(timestamp: number): Promise<number> {
    return await getBlockByTimestamp(this.networkName, timestamp);
  }
  async getAccountIdsByAddress(address: string): Promise<number[]> {
    const { result } = await getAccountIdsByAddress(this.networkName, address);
    return result;
  }
}
