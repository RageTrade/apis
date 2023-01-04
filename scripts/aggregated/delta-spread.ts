import { fetchJson, formatEther, formatUnits } from "ethers/lib/utils";

import {
  aave,
  deltaNeutralGmxVaults,
  gmxProtocol,
  NetworkName,
  ResultWithMetadata,
  tokens,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";
import type { TokenSwappedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager";
import { decimals, price, name } from "./util/helpers";
import { depositWithdrawRebalance } from "./util/events/deposit-withdraw-rebalance";
import { GlobalTotalSharesResult } from "./total-shares";
import { combine } from "./util/combine";
import { days, timestampRoundDown } from "../../utils";

export type GlobalDeltaSpreadEntry = Entry<{
  timestamp: number;

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

  btcHedgeDeltaPnl: number;
  ethHedgeDeltaPnl: number;

  btcPrice: number;
  ethPrice: number;
  btcAmountAfter: number;
  ethAmountAfter: number;
  btcUsdgAmount: number;
  ethUsdgAmount: number;
  fsGlp_balanceOf_juniorVault: number;
  fsGlp_balanceOf_batchingManager: number;
  glp_totalSupply: number;
}>;

export interface GlobalDeltaSpreadDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  slippageNet: number;
  volumeNet: number;
  btcHedgeDeltaPnlNet: number;
  ethHedgeDeltaPnlNet: number;
}

export interface GlobalDeltaSpreadResult {
  data: GlobalDeltaSpreadEntry[];
  dailyData: GlobalDeltaSpreadDailyEntry[];

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

  totalBtcHedgeDeltaPnl: number;
  totalEthHedgeDeltaPnl: number;
}

export async function getDeltaSpread(
  networkName: NetworkName
): Promise<GlobalDeltaSpreadResult> {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(
    networkName,
    provider
  );
  const { wbtc, weth, fsGLP, glp } = tokens.getContractsSync(
    networkName,
    provider
  );
  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName);
  const { aUsdc } = aave.getContractsSync(networkName, provider);
  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress);
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress);

  const totalSharesData: ResultWithMetadata<GlobalTotalSharesResult> =
    await fetchJson({
      url: `http://localhost:3000/data/aggregated/get-total-shares?networkName=${networkName}`,
      timeout: 1_000_000_000, // huge number
    });

  const data = await parallelize(
    networkName,
    provider,
    depositWithdrawRebalance,
    { uniqueBlocks: false }, // consider each block because we are using event.args
    async (_i, blockNumber, event) => {
      const rc = await provider.getTransactionReceipt(event.transactionHash);
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

      let btcPrice: number = await price(
        wbtc.address,
        blockNumber,
        networkName
      );
      let ethPrice: number = await price(
        weth.address,
        blockNumber,
        networkName
      );

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

      const _btcAmountAfter = await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber,
      });
      const btcAmountAfter = Number(formatUnits(_btcAmountAfter, 8));

      const _ethAmountAfter = await vdWeth.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber,
      });
      const ethAmountAfter = Number(formatUnits(_ethAmountAfter, 18));

      const _btcUsdgAmount = await gmxUnderlyingVault.usdgAmounts(
        wbtc.address,
        { blockTag: blockNumber }
      );
      const btcUsdgAmount = Number(formatEther(_btcUsdgAmount));

      const _ethUsdgAmount = await gmxUnderlyingVault.usdgAmounts(
        weth.address,
        { blockTag: blockNumber }
      );
      const ethUsdgAmount = Number(formatEther(_ethUsdgAmount));

      const fsGlp_balanceOf_juniorVault = Number(
        formatEther(
          await fsGLP.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          })
        )
      );
      const fsGlp_balanceOf_batchingManager = Number(
        formatEther(
          await dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
            blockTag: blockNumber,
          })
        )
      );
      const glp_totalSupply = Number(
        formatEther(
          await glp.totalSupply({
            blockTag: blockNumber,
          })
        )
      );

      // TODO export price and then do the "last" kind of loop after this
      return {
        blockNumber,
        transactionHash: event.transactionHash,
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

        btcPrice,
        ethPrice,
        btcAmountAfter,
        ethAmountAfter,
        btcUsdgAmount,
        ethUsdgAmount,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
        glp_totalSupply,
      };
    }
  );

  const dataWithTimestamp = combine(
    data,
    totalSharesData.result.data,
    (a, b) => ({
      ...a,
      timestamp: b.timestamp,
    })
  );

  const extraData: Entry<{
    btcHedgeDeltaPnl: number;
    ethHedgeDeltaPnl: number;
  }>[] = [];

  let last;
  for (const current of dataWithTimestamp) {
    if (last) {
      const lastBtcAmountVault =
        (last.btcUsdgAmount *
          (last.fsGlp_balanceOf_juniorVault +
            last.fsGlp_balanceOf_batchingManager)) /
        last.glp_totalSupply /
        last.btcPrice;
      const lastEthAmountVault =
        (last.ethUsdgAmount *
          (last.fsGlp_balanceOf_juniorVault +
            last.fsGlp_balanceOf_batchingManager)) /
        last.glp_totalSupply /
        last.ethPrice;

      const priceDiffEth = current.ethPrice - last.ethPrice;
      const priceDiffBtc = current.btcPrice - last.btcPrice;

      const btcHedgeDeltaPnl =
        (lastBtcAmountVault - last.btcAmountAfter) * priceDiffBtc;
      const ethHedgeDeltaPnl =
        (lastEthAmountVault - last.ethAmountAfter) * priceDiffEth;

      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        btcHedgeDeltaPnl,
        ethHedgeDeltaPnl,
      });
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        transactionHash: current.transactionHash,
        btcHedgeDeltaPnl: 0,
        ethHedgeDeltaPnl: 0,
      });
    }
    last = current;
  }

  const combinedData = combine(dataWithTimestamp, extraData, (a, b) => ({
    ...a,
    ...b,
  }));

  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (acc: GlobalDeltaSpreadDailyEntry[], cur: GlobalDeltaSpreadEntry) => {
        const lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.slippageNet += cur.slippage;
          lastEntry.volumeNet += cur.volume;
        } else {
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            slippageNet: cur.slippage,
            volumeNet: cur.volume,
            btcHedgeDeltaPnlNet: cur.btcHedgeDeltaPnl,
            ethHedgeDeltaPnlNet: cur.ethHedgeDeltaPnl,
          });
        }
        return acc;
      },
      []
    ),

    totalVolume: combinedData.reduce((acc, cur) => acc + cur.volume, 0),
    totalSlippage: combinedData.reduce((acc, cur) => acc + cur.slippage, 0),
    totalBtcBought: combinedData.reduce((acc, cur) => acc + cur.btcBought, 0),
    totalEthBought: combinedData.reduce((acc, cur) => acc + cur.ethBought, 0),
    totalBtcSold: combinedData.reduce((acc, cur) => acc + cur.btcSold, 0),
    totalEthSold: combinedData.reduce((acc, cur) => acc + cur.ethSold, 0),
    totalBtcBoughtSlippage: data.reduce(
      (acc, cur) => acc + cur.btcBoughtSlippage,
      0
    ),
    totalEthBoughtSlippage: combinedData.reduce(
      (acc, cur) => acc + cur.ethBoughtSlippage,
      0
    ),
    totalBtcSoldSlippage: combinedData.reduce(
      (acc, cur) => acc + cur.btcSoldSlippage,
      0
    ),
    totalEthSoldSlippage: combinedData.reduce(
      (acc, cur) => acc + cur.ethSoldSlippage,
      0
    ),
    totalBtcHedgeDeltaPnl: combinedData.reduce(
      (acc, cur) => acc + cur.btcHedgeDeltaPnl,
      0
    ),
    totalEthHedgeDeltaPnl: combinedData.reduce(
      (acc, cur) => acc + cur.ethHedgeDeltaPnl,
      0
    ),
  };
}
