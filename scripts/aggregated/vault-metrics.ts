import {
  aave,
  tokens,
  chainlink,
  formatUsdc,
  gmxProtocol,
  deltaNeutralGmxVaults,
} from "@ragetrade/sdk";
import "isomorphic-unfetch";

import { formatEther, formatUnits } from "ethers/lib/utils";
import {
  GlpSwappedEvent,
  RewardsHarvestedEvent,
  TokenSwappedEvent,
} from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager";
import { arbmain } from "../../providers";

export async function getVaultMetrics() {
  const START_BLOCK = 45607856;
  const END_BLOCK = undefined;

  const { aUsdc } = await aave.getContracts(arbmain);
  const { glpManager, gmxUnderlyingVault } = await gmxProtocol.getContracts(
    arbmain
  );
  const { weth, wbtc, usdc, glp, fsGLP } = await tokens.getContracts(arbmain);

  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses("arbmain");

  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress);
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress);

  const { ethUsdAggregator, btcUsdAggregator } = await chainlink.getContracts(
    arbmain
  );
  const usdcUsdAggregator = ethUsdAggregator.attach(
    "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3"
  );

  const { dnGmxJuniorVault, dnGmxBatchingManager, dnGmxSeniorVault } =
    await deltaNeutralGmxVaults.getContracts(arbmain);

  const allRebalancedEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Rebalanced(),
    START_BLOCK,
    END_BLOCK
  );
  const allJuniorDepositEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Deposit(),
    START_BLOCK,
    END_BLOCK
  );
  const allJuniorWithdrawEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.Withdraw(),
    START_BLOCK,
    END_BLOCK
  );
  const allSeniorDepositEvents = await dnGmxSeniorVault.queryFilter(
    dnGmxJuniorVault.filters.Deposit(),
    START_BLOCK,
    END_BLOCK
  );
  const allSeniorWithdrawEvents = await dnGmxSeniorVault.queryFilter(
    dnGmxJuniorVault.filters.Withdraw(),
    START_BLOCK,
    END_BLOCK
  );
  const allRewardsHarvestedEvents = await dnGmxJuniorVault.queryFilter(
    dnGmxJuniorVault.filters.RewardsHarvested(),
    START_BLOCK,
    END_BLOCK
  );

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
            (await ethUsdAggregator.latestRoundData({ blockTag: blockNumber }))
              .answer,
            8
          )
        );
      case wbtc.address.toLowerCase():
        return Number(
          formatUnits(
            (await btcUsdAggregator.latestRoundData({ blockTag: blockNumber }))
              .answer,
            8
          )
        );
      case usdc.address.toLowerCase():
        return Number(
          formatUnits(
            (await usdcUsdAggregator.latestRoundData({ blockTag: blockNumber }))
              .answer,
            8
          )
        );
      default:
        throw new Error("i dont know");
    }
  }

  let i = 0;
  let j = 0;
  let k = 0;

  let done = 0;
  let failed = 0;

  let promisesLend = [];
  let promisesBorrow = [];
  let promisesRewards = [];
  let promisesDeltaSpread = [];
  let promisesGlpSlippage = [];
  let promisesUniswapSlippage = [];

  let lastRowAaveLends;
  let lastRowAaveBorrows;
  let lastRowDeltaSpread;

  let cumilativeGlpSlippage = 0;

  let totalBtcBought = 0;
  let totalEthBought = 0;
  let totalBtcSold = 0;
  let totalEthSold = 0;
  let totalBtcBoughtSlippage = 0;
  let totalEthBoughtSlippage = 0;
  let totalBtcSoldSlippage = 0;
  let totalEthSoldSlippage = 0;

  let totalVolume = 0;
  let cumilativeUniswapSlippage = 0;

  let glpNetPnl = 0;
  let aaveNetPnl = 0;
  let traderPnlVault = 0;
  let juniorVaultWethRewards = 0;
  let seniorVaultWethRewards = 0;
  let vdWbtcInterestAccumulator = 0;
  let vdWethInterestAccumulator = 0;
  let aUsdcInterestAccumulatorJunior = 0;
  let aUsdcInterestAccumulatorSenior = 0;
  let vdWbtcInterestDollarsAccumulator = 0;
  let vdWethInterestDollarsAccumulator = 0;
  let btcHedgeDeltaPnlAccumulator = 0;
  let ethHedgeDeltaPnlAccumulator = 0;

  let isBlockUsedForLend = new Map<number, boolean>();
  let isBlockUsedForBorrow = new Map<number, boolean>();
  let isBlockUsedForDeltaSpread = new Map<number, boolean>();

  let dataLends: (string | number)[][] = [];
  let dataBorrows: (string | number)[][] = [];
  let dataDeltaSpreads: (string | number)[][] = [];

  const allEvents = [
    ...allRebalancedEvents,
    ...allJuniorDepositEvents,
    ...allSeniorDepositEvents,
    ...allJuniorWithdrawEvents,
    ...allSeniorWithdrawEvents,
    ...allRewardsHarvestedEvents,
  ].sort((a, b) => a.blockNumber - b.blockNumber);

  //   console.log("total_events", allEvents.length);

  for (let i = 0; i < allEvents.length; i++) {
    if (
      allEvents[i].event == "Deposit" ||
      allEvents[i].event == "Withdraw" ||
      allEvents[i].event == "Rebalanced"
    ) {
      if (allEvents[i].address == dnGmxJuniorVault.address) {
        dataBorrows.push([]);
      }
      dataLends.push([]);
    }
  }

  for (const event of allEvents) {
    if (event.event == "RewardsHarvested")
      promisesRewards.push(logRewards(event as RewardsHarvestedEvent));

    if (event.event == "Rebalanced") {
      promisesUniswapSlippage.push(
        logUniswapSlippage(event.blockNumber, event.transactionHash)
      );
    }

    if (
      event.event == "Deposit" ||
      event.event == "Withdraw" ||
      event.event == "Rebalanced"
    ) {
      if (event.address == dnGmxJuniorVault.address) {
        promisesBorrow.push(logAaveBorrows(i++, event.blockNumber));
        promisesLend.push(logAaveLends(j++, event.blockNumber));
        promisesGlpSlippage.push(
          logGlpSlippage(event.blockNumber, event.transactionHash)
        );
        promisesDeltaSpread.push(logDeltaSpread(k++, event.blockNumber));
      }

      if (event.address == dnGmxSeniorVault.address) {
        promisesLend.push(logAaveLends(j++, event.blockNumber));
      }
    }
  }

  let intr = setInterval(() => {
    console.log("done", done, "retries", failed, "total", allEvents.length);
  }, 5000);

  await logTraderPnl();
  await Promise.all(promisesLend);
  await Promise.all(promisesBorrow);
  await Promise.all(promisesRewards);
  await Promise.all(promisesGlpSlippage);
  await Promise.all(promisesDeltaSpread);
  await Promise.all(promisesUniswapSlippage);

  clearInterval(intr);

  const _dataLends = dataLends.filter((e) => e);
  const _dataBorrows = dataBorrows.filter((e) => e);
  const _dataDeltaSpreads = dataDeltaSpreads.filter((e) => e);

  for (const [index, row] of _dataBorrows.entries()) {
    if (isNaN(Number(row[1]))) continue;

    if (lastRowAaveBorrows) {
      const [
        btcAmountBeforeLast,
        btcAmountAfterLast,
        ethAmountBeforeLast,
        ethAmountAfterLast,
        btcPriceLast,
        ethPriceLast,
      ] = lastRowAaveBorrows as number[];

      const [
        btcAmountBefore,
        btcAmountAfter,
        ethAmountBefore,
        ethAmountAfter,
        btcPrice,
        ethPrice,
      ] = row as number[];

      /**
       * Variable Debt Token Interest (t) =
       *    variableDebtToken(before t) - variableDebtToken(after t-1)
       * Variable Debt Token Interest Dollars(t) =
       *    (variableDebtToken(before t) - variableDebtToken(after t-1)) * tokenPrice(before t)
       */

      const vdWbtcInterest = btcAmountBefore - btcAmountAfterLast;
      const vdWbtcInterestDollars = vdWbtcInterest * btcPriceLast;

      const vdWethInterest = ethAmountBefore - ethAmountAfterLast;
      const vdWethInterestDollars = vdWethInterest * ethPriceLast;

      vdWbtcInterestAccumulator += btcAmountBefore - btcAmountAfterLast;
      vdWbtcInterestDollarsAccumulator += vdWbtcInterestDollars;

      vdWethInterestAccumulator += ethAmountBefore - ethAmountAfterLast;
      vdWethInterestDollarsAccumulator += vdWethInterestDollars;
    } else {
      row.push(0);
      row.push(0);
    }
    lastRowAaveBorrows = row;
  }

  for (const row of _dataLends) {
    if (isNaN(Number(row[1]))) continue;

    if (lastRowAaveLends) {
      const [
        aUsdcjuniorBeforeLast,
        aUsdcSeniorBeforeLast,
        aUsdcjuniorAfterLast,
        aUsdcSeniorAfterLast,
      ] = lastRowAaveLends as number[];

      const [
        aUsdcjuniorBefore,
        aUsdcSeniorBefore,
        aUsdcjuniorAfter,
        aUsdcSeniorAfter,
      ] = row as number[];

      /**
       * aUsdc Token Interest (t) =
       *    aUsdcBalance(before t) - aUsdc(after t-1)
       */

      const aUsdcInterestJunior = aUsdcjuniorBefore - aUsdcjuniorAfterLast;
      const aUsdcInterestSenior = aUsdcSeniorBefore - aUsdcSeniorAfterLast;

      aUsdcInterestAccumulatorJunior += aUsdcInterestJunior;
      aUsdcInterestAccumulatorSenior += aUsdcInterestSenior;
    } else {
      row.push(0);
      row.push(0);
    }
    lastRowAaveLends = row;
  }

  const data = [];

  for (const row of _dataDeltaSpreads) {
    if (isNaN(Number(row[1]))) continue;
    if (lastRowDeltaSpread) {
      const [
        btcAmountBeforeLast,
        btcAmountAfterLast,
        ethAmountBeforeLast,
        ethAmountAfterLast,
        btcPriceLast,
        ethPriceLast,
        fsGlp_balanceOf_juniorVaultLast,
        fsGlp_balanceOf_batchingManagerLast,
        glp_totalSupplyLast,
        glpPriceLast,
        currentEthUsdgAmountLast,
        currentBtcUsdgAmountLast,
      ] = lastRowDeltaSpread as number[];

      const [
        btcAmountBefore,
        btcAmountAfter,
        ethAmountBefore,
        ethAmountAfter,
        btcPrice,
        ethPrice,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
        glp_totalSupply,
        glpPrice,
        currentEthUsdgAmount,
        currentBtcUsdgAmount,
      ] = row as number[];

      //  AAVE Pnl: AAVE PNL (t+1)  = - ( btcAmount(before t+1) * btcPrice(before t+1) - btcAmount(after t) * btcPrice(after t))
      // - ( ethAmount(before t+1) * ethPrice(before t+1) - ethAmount(after t) * ethPrice(after t))
      const aavePnl =
        -(btcAmountBefore * btcPrice - btcAmountAfterLast * btcPriceLast) -
        (ethAmountBefore * ethPrice - ethAmountAfterLast * ethPriceLast);

      // glpPnl(t+1) = (fsGlp.balanceOf(juniorVault) + batchingManger.juniorVaultGlpBalance()) * userShares/totalSupply * (glpPrice(t+1) - glpPrice(t))
      const glpPnl =
        (fsGlp_balanceOf_juniorVaultLast +
          fsGlp_balanceOf_batchingManagerLast) *
        (glpPrice - glpPriceLast);

      const ethCurrentAmountVaultLast =
        (currentEthUsdgAmountLast *
          (fsGlp_balanceOf_juniorVaultLast +
            fsGlp_balanceOf_batchingManagerLast)) /
        glp_totalSupplyLast /
        ethPriceLast;
      const btcCurrentAmountVaultLast =
        (currentBtcUsdgAmountLast *
          (fsGlp_balanceOf_juniorVaultLast +
            fsGlp_balanceOf_batchingManagerLast)) /
        glp_totalSupplyLast /
        btcPriceLast;

      const priceDiffEth = ethPrice - ethPriceLast;
      const priceDiffBtc = btcPrice - btcPriceLast;

      const btcHedgeDeltaPnl =
        (btcCurrentAmountVaultLast - btcAmountAfterLast) * priceDiffBtc;
      const ethHedgeDeltaPnl =
        (ethCurrentAmountVaultLast - ethAmountAfterLast) * priceDiffEth;

      btcHedgeDeltaPnlAccumulator += btcHedgeDeltaPnl;
      ethHedgeDeltaPnlAccumulator += ethHedgeDeltaPnl;

      //   console.log(
      //     [
      //       ethCurrentAmountVaultLast,
      //       btcCurrentAmountVaultLast,
      //       ethPrice,
      //       btcPrice,
      //       ethPriceLast,
      //       btcPriceLast,
      //       btcHedgeDeltaPnl,
      //       ethHedgeDeltaPnl,
      //     ].join(",")
      //   );

      data.push({
        ethCurrentAmountVaultLast,
        btcCurrentAmountVaultLast,
        ethPrice,
        btcPrice,
        ethPriceLast,
        btcPriceLast,
        btcHedgeDeltaPnl,
        ethHedgeDeltaPnl,
      });

      aaveNetPnl += aavePnl;
      glpNetPnl += glpPnl;

      row.push(aavePnl);
      row.push(glpPnl);
    } else {
      row.push(0);
      row.push(0);
    }
    lastRowDeltaSpread = row;
  }

  clearInterval(intr);

  return {
    glpNetPnl,
    aaveNetPnl,
    traderPnlVault,
    cumilativeGlpSlippage,
    juniorVaultWethRewards,
    seniorVaultWethRewards,
    vdWbtcInterestAccumulator,
    vdWethInterestAccumulator,
    cumilativeUniswapSlippage,
    aUsdcInterestAccumulatorJunior,
    aUsdcInterestAccumulatorSenior,
    btcHedgeDeltaPnlAccumulator,
    ethHedgeDeltaPnlAccumulator,
    vdWbtcInterestDollarsAccumulator,
    vdWethInterestDollarsAccumulator,
    data,
  };

  async function logRewards(event: RewardsHarvestedEvent) {
    while (1) {
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * 20_000))
      );

      try {
        const { juniorVaultGlp, seniorVaultAUsdc } = event.args;

        const [aumMax, _] = await glpManager.getAums({
          blockTag: event.blockNumber,
        });

        const glpTotalSuply = await fsGLP.totalSupply({
          blockTag: event.blockNumber,
        });

        const glpPrice = Number(formatUnits(aumMax.div(glpTotalSuply), 12));

        const rewardsJunior = Number(formatEther(juniorVaultGlp)) * glpPrice;

        juniorVaultWethRewards += rewardsJunior;
        seniorVaultWethRewards += Number(formatUsdc(seniorVaultAUsdc));

        break;
      } catch (e) {
        // console.log(e);
        // console.log("retrying");
        failed++;
      }
    }
  }

  async function logDeltaSpread(_i: number, blockNumber: number) {
    if (isBlockUsedForDeltaSpread.has(blockNumber)) return;
    isBlockUsedForDeltaSpread.set(blockNumber, true);
    while (1) {
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * 20_000))
      );
      try {
        const [
          _btcAmountBefore,
          _btcAmountAfter,
          _ethAmountBefore,
          _ethAmountAfter,
          pb,
          pe,
          _fsGlp_balanceOf_juniorVault,
          _fsGlp_balanceOf_batchingManager,
          _glp_totalSupply,
          _glpPrice,
          _currentEthUsdgAmount,
          _currentBtcUsdgAmount,
        ] = await Promise.all([
          vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          }),
          vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          }),
          vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          }),
          vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          }),
          price(wbtc.address, blockNumber),
          price(weth.address, blockNumber),
          fsGLP.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          }),
          dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
            blockTag: blockNumber,
          }),
          glp.totalSupply({ blockTag: blockNumber }),
          dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber,
          }),
          gmxUnderlyingVault.usdgAmounts(weth.address, {
            blockTag: blockNumber,
          }),
          gmxUnderlyingVault.usdgAmounts(wbtc.address, {
            blockTag: blockNumber,
          }),
        ]);

        const btcAmountBefore = formatUnits(_btcAmountBefore, 8);
        const btcAmountAfter = formatUnits(_btcAmountAfter, 8);

        const ethAmountBefore = formatUnits(_ethAmountBefore, 18);
        const ethAmountAfter = formatUnits(_ethAmountAfter, 18);

        const btcPriceD8 = pb;
        const ethPriceD18 = pe;

        const fsGlp_balanceOf_juniorVault = formatEther(
          _fsGlp_balanceOf_juniorVault
        );

        const fsGlp_balanceOf_batchingManager = formatEther(
          _fsGlp_balanceOf_batchingManager
        );

        const glpPrice = formatEther(_glpPrice);
        const glp_totalSupply = formatEther(_glp_totalSupply);

        const currentEthUsdgAmount = formatEther(_currentEthUsdgAmount);
        const currentBtcUsdgAmount = formatEther(_currentBtcUsdgAmount);

        const log = [
          Number(btcAmountBefore),
          Number(btcAmountAfter),
          Number(ethAmountBefore),
          Number(ethAmountAfter),
          Number(btcPriceD8),
          Number(ethPriceD18),
          Number(fsGlp_balanceOf_juniorVault),
          Number(fsGlp_balanceOf_batchingManager),
          Number(glp_totalSupply),
          Number(glpPrice),
          Number(currentEthUsdgAmount),
          Number(currentBtcUsdgAmount),
        ];
        dataDeltaSpreads[_i + 1] = log;
        done++;
        break;
      } catch (e: any) {
        // console.log(e);
        // console.log("retrying");
        failed++;
      }
    }
  }

  async function logUniswapSlippage(blockNumber: number, txHash: string) {
    while (1) {
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * 20_000))
      );
      try {
        const rc = await arbmain.getTransactionReceipt(txHash);
        const filter = dnGmxJuniorVault.filters.TokenSwapped();
        const parsed = rc.logs
          .filter((log) => log.topics[0] === filter.topics?.[0])
          .map((log) =>
            dnGmxJuniorVault.interface.parseLog(log)
          ) as unknown as TokenSwappedEvent[];

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

          if (name(event.args.fromToken) === "wbtc") {
            totalBtcSold += fromDollar;
            totalBtcSoldSlippage += slippageDollar;
          }
          if (name(event.args.fromToken) === "weth") {
            totalEthSold += fromDollar;
            totalEthSoldSlippage += slippageDollar;
          }
          if (name(event.args.toToken) === "wbtc") {
            totalBtcBought += toDollar;
            totalBtcBoughtSlippage += slippageDollar;
          }
          if (name(event.args.toToken) === "weth") {
            totalEthBought += toDollar;
            totalEthBoughtSlippage += slippageDollar;
          }

          totalVolume += fromDollar;
          cumilativeUniswapSlippage += slippageDollar;
        }

        done++;
        break;
      } catch (e: any) {
        // console.log(e);
        // console.log("retrying");
        failed++;
      }
    }
  }

  async function logGlpSlippage(blockNumber: number, txHash: string) {
    const scaling = 1;
    while (1) {
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * 20_000))
      );

      try {
        const rc = await arbmain.getTransactionReceipt(txHash);
        const filter = dnGmxJuniorVault.filters.GlpSwapped();
        const parsed = rc.logs
          .filter((log) => log.topics[0] === filter.topics?.[0])
          .map((log) =>
            dnGmxJuniorVault.interface.parseLog(log)
          ) as unknown as GlpSwappedEvent[];

        for (const event of parsed) {
          const { glpQuantity, usdcQuantity, fromGlpToUsdc } = event.args;

          const glpAmt = Number(formatEther(glpQuantity));
          const usdcAmt = Number(formatUsdc(usdcQuantity));

          const [_, aumMin] = await glpManager.getAums({
            blockTag: blockNumber,
          });

          const totalSuply = await fsGLP.totalSupply({
            blockTag: blockNumber,
          });

          const glpPriceMin = Number(formatUnits(aumMin.div(totalSuply), 12));

          fromGlpToUsdc
            ? (cumilativeGlpSlippage +=
                scaling * (usdcAmt - glpAmt * glpPriceMin))
            : (cumilativeGlpSlippage +=
                scaling * (glpAmt * glpPriceMin - usdcAmt));
        }
        break;
      } catch (e) {
        // console.log(e);
        // console.log("retrying");
        failed++;
      }
    }
  }

  async function logAaveBorrows(_i: number, blockNumber: number) {
    if (isBlockUsedForBorrow.has(blockNumber)) return;
    isBlockUsedForBorrow.set(blockNumber, true);

    while (1) {
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * 20_000))
      );
      try {
        const [
          _btcAmountBefore,
          _btcAmountAfter,
          _ethAmountBefore,
          _ethAmountAfter,
          pb,
          pe,
        ] = await Promise.all([
          vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          }),
          vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          }),
          vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          }),
          vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          }),
          price(wbtc.address, blockNumber),
          price(weth.address, blockNumber),
        ]);

        const btcAmountBefore = formatUnits(_btcAmountBefore, 8);
        const btcAmountAfter = formatUnits(_btcAmountAfter, 8);

        const ethAmountBefore = formatUnits(_ethAmountBefore, 18);
        const ethAmountAfter = formatUnits(_ethAmountAfter, 18);

        const btcPriceD8 = pb;
        const ethPriceD18 = pe;

        const log = [
          Number(btcAmountBefore),
          Number(btcAmountAfter),
          Number(ethAmountBefore),
          Number(ethAmountAfter),
          Number(btcPriceD8),
          Number(ethPriceD18),
        ];

        dataBorrows[_i + 1] = log;

        done++;
        break;
      } catch (e: any) {
        // console.log(e);
        // console.log("retrying");
        failed++;
      }
    }
  }

  async function logAaveLends(_i: number, blockNumber: number) {
    if (isBlockUsedForLend.has(blockNumber)) return;
    isBlockUsedForLend.set(blockNumber, true);

    while (1) {
      await new Promise((r) =>
        setTimeout(r, Math.floor(Math.random() * 20_000))
      );
      try {
        const [
          _aUsdcjuniorBefore,
          _aUsdcSeniorBefore,
          _aUsdcjuniorAfter,
          _aUsdcSeniorAfter,
        ] = await Promise.all([
          aUsdc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          }),
          aUsdc.balanceOf(dnGmxSeniorVault.address, {
            blockTag: blockNumber - 1,
          }),
          aUsdc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          }),
          aUsdc.balanceOf(dnGmxSeniorVault.address, {
            blockTag: blockNumber,
          }),
        ]);

        const log = [
          Number(formatUsdc(_aUsdcjuniorBefore)),
          Number(formatUsdc(_aUsdcSeniorBefore)),
          Number(formatUsdc(_aUsdcjuniorAfter)),
          Number(formatUsdc(_aUsdcSeniorAfter)),
        ];

        dataLends[_i + 1] = log;

        done++;
        break;
      } catch (e: any) {
        // console.log(e);
        // console.log("retrying");
        failed++;
      }
    }
  }

  // done
  async function logTraderPnl() {
    const gmxSubgraphUrl =
      "https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats";

    const queryTraderData = async (from_ts: string, to_ts: string) => {
      const results = await fetch(gmxSubgraphUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
          query gmxTraderStats {
            tradingStats(
              first: 1000
              orderBy: timestamp
              orderDirection: desc
              where: { period: "daily", timestamp_gte: ${from_ts}, timestamp_lte: ${to_ts} }
              subgraphError: allow
            ) {
              timestamp
              profit
              loss
              profitCumulative
              lossCumulative
              longOpenInterest
              shortOpenInterest
            }
          }
        `,
        }),
      });

      return (await results.json()).data;
    };

    const currentDate = new Date();
    const to_ts = Math.floor(currentDate.getTime() / 1000).toString();
    const from_ts = (await arbmain.getBlock(START_BLOCK)).timestamp.toString();

    let traderPnl = [];
    let vaultShare = [];

    const traderData = await queryTraderData(from_ts, to_ts);

    for (const each of traderData.tradingStats) {
      const loss = each.loss / 1e30;
      const profit = each.profit / 1e30;

      const block = (
        await (
          await fetch(`https://coins.llama.fi/block/arbitrum/${each.timestamp}`)
        ).json()
      ).height;

      const vaultGlp = Number(
        formatEther(
          (
            await dnGmxBatchingManager.dnGmxJuniorVaultGlpBalance({
              blockTag: block,
            })
          ).add(
            await fsGLP.balanceOf(dnGmxJuniorVault.address, { blockTag: block })
          )
        )
      );

      const totalGlp = Number(
        formatEther(await glp.totalSupply({ blockTag: block }))
      );

      traderPnl.push(profit - loss);
      vaultShare.push(vaultGlp / totalGlp);
    }

    for (const [index, pnl] of traderPnl.entries()) {
      traderPnlVault += pnl * vaultShare[index];
    }
  }
}
