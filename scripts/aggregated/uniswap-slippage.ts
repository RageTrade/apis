import { formatUnits } from "ethers/lib/utils";

import {
  aave,
  chainlink,
  deltaNeutralGmxVaults,
  NetworkName,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { combine } from "./util/combine";
import { parallelizeOverEveryDWR } from "./util/template";
import { Entry } from "./util/types";
import type { TokenSwappedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager";

export type GlobalUniswapSlippageEntry = Entry<{
  volume: number;
  slippage: number;
  btcBought: number;
  ethBought: number;
  btcSold: number;
  ethSold: number;
  btcBoughtSlippage: number;
  ethBoughtSlippage: number;
  btcSoldSlippage: number;
  ethSoldSlippage: number;
}>;

export interface GlobalUniswapSlippageResult {
  totalVolume: number;
  totalSlippage: number;

  totalBtcBought: number;
  totalEthBought: number;
  totalBtcSold: number;
  totalEthSold: number;
  totalBtcBoughtSlippage: number;
  totalEthBoughtSlippage: number;
  totalBtcSoldSlippage: number;
  totalEthSoldSlippage: number;

  data: GlobalUniswapSlippageEntry[];
}

export async function getUniswapSlippage(
  networkName: NetworkName
): Promise<GlobalUniswapSlippageResult> {
  const provider = getProviderAggregate(networkName);

  const { weth, wbtc, usdc } = tokens.getContractsSync(networkName, provider);
  const { aUsdc } = aave.getContractsSync(networkName, provider);
  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

  const { ethUsdAggregator, btcUsdAggregator } =
    await chainlink.getContractsSync(networkName, provider);
  const usdcUsdAggregator = ethUsdAggregator.attach(
    "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3"
  );

  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName);
  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress);
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress);

  const data: GlobalUniswapSlippageEntry[] = await parallelizeOverEveryDWR(
    networkName,
    provider,
    async (_i, blockNumber, eventName, transactionHash, logIndex) => {
      const rc = await provider.getTransactionReceipt(transactionHash);
      const filter = dnGmxJuniorVault.filters.TokenSwapped();
      const parsed = rc.logs
        .filter((log) => log.topics[0] === filter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as TokenSwappedEvent[];

      let volume = 0;
      let slippage = 0;

      let btcBought = 0;
      let ethBought = 0;
      let btcSold = 0;
      let ethSold = 0;
      let btcBoughtSlippage = 0;
      let ethBoughtSlippage = 0;
      let btcSoldSlippage = 0;
      let ethSoldSlippage = 0;

      for (const event of parsed) {
        const fromPrice = await price(event.args.fromToken, blockNumber);
        const toPrice = await price(event.args.toToken, blockNumber);

        const fromQuantity = Number(
          formatUnits(event.args.fromQuantity, decimals(event.args.fromToken))
        );
        const toQuantity = Number(
          formatUnits(event.args.toQuantity, decimals(event.args.toToken))
        );

        const fromDollar = fromPrice * fromQuantity;
        const toDollar = toPrice * toQuantity;
        const slippageDollar = toDollar - fromDollar;
        //   vaultSumSlippageDollar += slippageDollar;

        if (name(event.args.fromToken) === "wbtc") {
          btcSold += fromDollar;
          btcSoldSlippage += slippageDollar;
        }
        if (name(event.args.fromToken) === "weth") {
          ethSold += fromDollar;
          ethSoldSlippage += slippageDollar;
        }
        if (name(event.args.toToken) === "wbtc") {
          btcBought += toDollar;
          btcBoughtSlippage += slippageDollar;
        }
        if (name(event.args.toToken) === "weth") {
          ethBought += toDollar;
          ethBoughtSlippage += slippageDollar;
        }
        volume += fromDollar;
        slippage += slippageDollar;
      }

      return {
        blockNumber,
        eventName,
        transactionHash,
        logIndex,
        volume,
        slippage,
        btcBought,
        ethBought,
        btcSold,
        ethSold,
        btcBoughtSlippage,
        ethBoughtSlippage,
        btcSoldSlippage,
        ethSoldSlippage,
      };
    }
  );

  return {
    totalVolume: data.reduce((acc, cur) => acc + cur.volume, 0),
    totalSlippage: data.reduce((acc, cur) => acc + cur.slippage, 0),
    totalBtcBought: data.reduce((acc, cur) => acc + cur.btcBought, 0),
    totalEthBought: data.reduce((acc, cur) => acc + cur.ethBought, 0),
    totalBtcSold: data.reduce((acc, cur) => acc + cur.btcSold, 0),
    totalEthSold: data.reduce((acc, cur) => acc + cur.ethSold, 0),
    totalBtcBoughtSlippage: data.reduce(
      (acc, cur) => acc + cur.btcBoughtSlippage,
      0
    ),
    totalEthBoughtSlippage: data.reduce(
      (acc, cur) => acc + cur.ethBoughtSlippage,
      0
    ),
    totalBtcSoldSlippage: data.reduce(
      (acc, cur) => acc + cur.btcSoldSlippage,
      0
    ),
    totalEthSoldSlippage: data.reduce(
      (acc, cur) => acc + cur.ethSoldSlippage,
      0
    ),
    data,
  };

  function name(addr: string) {
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

  function decimals(addr: string) {
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

  async function price(addr: string, blockNumber: number) {
    switch (addr.toLowerCase()) {
      case weth.address.toLowerCase():
        return Number(
          formatUnits(
            (
              await ethUsdAggregator.latestRoundData({
                blockTag: blockNumber,
              })
            ).answer,
            decimals(addr)
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
            decimals(addr)
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
            decimals(addr)
          )
        );
      default:
        throw new Error("i dont know");
    }
  }
}
