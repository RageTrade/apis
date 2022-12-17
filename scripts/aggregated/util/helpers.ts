import { formatUnits } from "ethers/lib/utils";

import { chainlink, NetworkName, tokens } from "@ragetrade/sdk";

import { getProviderAggregate } from "../../../providers";

export function name(addr: string, networkName: NetworkName) {
  const { weth, wbtc, usdc } = tokens.getContractsSync(networkName);
  switch (addr.toLowerCase()) {
    case weth.address.toLowerCase():
      return "weth";
    case wbtc.address.toLowerCase():
      return "wbtc";
    case usdc.address.toLowerCase():
      return "usdc";
    default:
      return addr;
  }
}

export function decimals(addr: string, networkName: NetworkName) {
  const { weth, wbtc, usdc } = tokens.getContractsSync(networkName);
  switch (addr.toLowerCase()) {
    case weth.address.toLowerCase():
      return 18;
    case wbtc.address.toLowerCase():
      return 8;
    case usdc.address.toLowerCase():
      return 6;
    default:
      return 18;
  }
}

export async function price(
  addr: string,
  blockNumber: number,
  networkName: NetworkName
) {
  const { weth, wbtc, usdc } = tokens.getContractsSync(
    networkName,
    getProviderAggregate(networkName)
  );

  const { ethUsdAggregator, btcUsdAggregator } =
    await chainlink.getContractsSync(
      networkName,
      getProviderAggregate(networkName)
    );
  const usdcUsdAggregator = ethUsdAggregator.attach(
    "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3"
  );

  switch (addr.toLowerCase()) {
    case weth.address.toLowerCase():
      return Number(
        formatUnits(
          (
            await ethUsdAggregator.latestRoundData({
              blockTag: blockNumber,
            })
          ).answer,
          8
        )
      );
    case wbtc.address.toLowerCase():
      return Number(
        formatUnits(
          (
            await btcUsdAggregator.latestRoundData({
              blockTag: blockNumber,
            })
          ).answer,
          8
        )
      );
    case usdc.address.toLowerCase():
      return Number(
        formatUnits(
          (
            await usdcUsdAggregator.latestRoundData({
              blockTag: blockNumber,
            })
          ).answer,
          8
        )
      );
    default:
      throw new Error("i dont know");
  }
}
