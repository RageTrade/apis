import { formatUnits } from "ethers/lib/utils";

import { deltaNeutralGmxVaults, NetworkName } from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { parallelizeOverEveryDWR } from "./util/template";
import { Entry } from "./util/types";
import type { TokenSwappedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager";
import { decimals, price, name } from "./util/helpers";

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

  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  );

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
        const fromPrice = await price(
          event.args.fromToken,
          blockNumber,
          networkName
        );
        const toPrice = await price(
          event.args.toToken,
          blockNumber,
          networkName
        );

        const fromQuantity = Number(
          formatUnits(
            event.args.fromQuantity,
            decimals(event.args.fromToken, networkName)
          )
        );
        const toQuantity = Number(
          formatUnits(
            event.args.toQuantity,
            decimals(event.args.toToken, networkName)
          )
        );

        const fromDollar = fromPrice * fromQuantity;
        const toDollar = toPrice * toQuantity;
        const slippageDollar = toDollar - fromDollar;
        //   vaultSumSlippageDollar += slippageDollar;

        if (name(event.args.fromToken, networkName) === "wbtc") {
          btcSold += fromDollar;
          btcSoldSlippage += slippageDollar;
        }
        if (name(event.args.fromToken, networkName) === "weth") {
          ethSold += fromDollar;
          ethSoldSlippage += slippageDollar;
        }
        if (name(event.args.toToken, networkName) === "wbtc") {
          btcBought += toDollar;
          btcBoughtSlippage += slippageDollar;
        }
        if (name(event.args.toToken, networkName) === "weth") {
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
}
