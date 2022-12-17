import {
  deltaNeutralGmxVaults,
  formatUsdc,
  getProvider,
  gmxProtocol,
  NetworkName,
  Q128,
  tokens,
  typechain,
  uniswap,
} from "@ragetrade/sdk";
import { BigNumber, BytesLike, ethers } from "ethers";
import {
  hexDataSlice,
  hexZeroPad,
  hexlify,
  concat,
  parseUnits,
} from "ethers/lib/utils";

export async function getDnGmxMaxDepositWithdrawEth(networkName: NetworkName) {
  const provider = getProvider(networkName);

  // contracts
  const { weth, wbtc, usdc } = await tokens.getContracts(provider);
  const { dnGmxJuniorVault } = await deltaNeutralGmxVaults.getContracts(
    provider
  );
  const { uniswapV3QuoterV1 } = await uniswap.getContracts(provider);
  const { gmxUnderlyingVault } = await gmxProtocol.getContracts(provider);

  // read private state
  const oracleAddress = hexDataSlice(
    await provider.getStorageAt(dnGmxJuniorVault.address, 252 + 22),
    32 - 20
  );
  const ethThreshold = BigNumber.from(
    hexDataSlice(
      await provider.getStorageAt(dnGmxJuniorVault.address, 252 + 10),
      32 - 6,
      32 - 4
    )
  );
  const oracle = typechain.deltaNeutralGmxVaults.IPriceOracle__factory.connect(
    oracleAddress,
    provider
  );

  // token weights
  const btcWeight = await gmxUnderlyingVault.tokenWeights(wbtc.address);
  const ethWeight = await gmxUnderlyingVault.tokenWeights(weth.address);
  const totalWeight = await gmxUnderlyingVault.totalTokenWeights();

  // eth price
  const ethOraclePriceD8 = await oracle.getAssetPrice(weth.address);
  const ethOraclePriceX128 = Q128.mul(ethOraclePriceD8)
    .div(10 ** (18 - 6)) // adjusting token decimals
    .div(1e8); // chainlink D8

  // calculate values
  const amounts = await getEthSellBuyAmounts();
  const maxDeposit = amounts.sell.eth
    .mul(ethOraclePriceX128)
    .mul(totalWeight)
    .div(btcWeight.add(ethWeight))
    .div(Q128);
  const maxWithdraw = amounts.buy.eth
    .mul(ethOraclePriceX128)
    .mul(totalWeight)
    .div(btcWeight.add(ethWeight))
    .div(Q128);

  return {
    maxDepositInUsd: formatUsdc(maxDeposit),
    maxWithdrawInUsd: formatUsdc(maxWithdraw),
  };

  //
  // Helper methods
  //

  async function getEthSellBuyAmounts() {
    const uint24 = (num: number) => hexZeroPad(hexlify(num), 3);

    const sellPath = concat([weth.address, uint24(500), usdc.address]);
    const buyPath = concat([usdc.address, uint24(500), weth.address]);

    const targetSellPriceX128 = ethOraclePriceX128
      .mul(BigNumber.from(1e4).sub(ethThreshold))
      .div(1e4);

    const targetBuyPriceX128 = ethOraclePriceX128
      .mul(BigNumber.from(1e4).add(ethThreshold))
      .div(1e4);

    // const sellResult = await boundedBinarySearch(
    //   sellPath,
    //   targetSellPriceX128,
    //   BigNumber.from(100000),
    //   parseUnits("10000000", 8),
    //   true
    // );
    // const buyResult = await boundedBinarySearch(
    //   buyPath,
    //   targetBuyPriceX128,
    //   BigNumber.from(100000),
    //   parseUnits("1000000000", 6),
    //   false
    // );
    const [sellResult, buyResult] = await Promise.all([
      boundedBinarySearch(
        sellPath,
        targetSellPriceX128,
        BigNumber.from(100000),
        parseUnits("1000000000", 8),
        true
      ),
      boundedBinarySearch(
        buyPath,
        targetBuyPriceX128,
        BigNumber.from(100000),
        parseUnits("10000000000", 8),
        false
      ),
    ]);

    // console.log({ sellResult, buyResult });
    return {
      sell: {
        eth: sellResult.amountIn,
        usdc: sellResult.amountOut,
      },
      buy: {
        eth: buyResult.amountOut,
        usdc: buyResult.amountIn,
      },
    };

    async function boundedBinarySearch(
      path: BytesLike,
      targetPriceX128: BigNumber,
      amountInLower: BigNumber,
      amountInUpper: BigNumber,
      isSell: boolean
    ) {
      // console.log("in boundedBinarySearch");
      {
        let amountOutLower = await uniswapV3QuoterV1.callStatic.quoteExactInput(
          path,
          amountInLower
        );

        //   console.log(
        //     formatUnits(amountInLower, 8),
        //     formatUnits(amountOutLower, 6)
        //   );

        let priceLowerX128 = isSell
          ? Q128.mul(amountOutLower).div(amountInLower)
          : Q128.mul(amountInLower).div(amountOutLower);
        let amountOutUpper = await uniswapV3QuoterV1.callStatic.quoteExactInput(
          path,
          amountInUpper
        );
        //   console.log(
        //     formatUnits(amountInUpper, 8),
        //     formatUnits(amountOutUpper, 6)
        //   );
        let priceUpperX128 = isSell
          ? Q128.mul(amountOutUpper).div(amountInUpper)
          : Q128.mul(amountInUpper).div(amountOutUpper);
        if (priceUpperX128.lt(priceLowerX128)) {
          [amountInUpper, amountInLower] = [amountInLower, amountInUpper];
          [priceUpperX128, priceLowerX128] = [priceLowerX128, priceUpperX128];
        }

        // console.log(
        //   "priceLowerX128",
        //   fromQ128(priceLowerX128),
        //   "priceUpperX128",
        //   fromQ128(priceUpperX128),
        //   "targetPriceX128",
        //   fromQ128(targetPriceX128)
        // );
        // console.log(
        //   "amountInLower",
        //   formatUnits(amountInLower, 6),
        //   "amountInUpper",
        //   formatUnits(amountInUpper, 6)
        // );

        if (targetPriceX128.lt(priceLowerX128)) {
          //   throw new Error("targetPriceX128 is less than priceLowerX128");
          return {
            amountIn: ethers.constants.Zero,
            amountOut: ethers.constants.Zero,
          };
        }

        if (targetPriceX128.gt(priceUpperX128)) {
          //   throw new Error("targetPriceX128 is greater than priceUpperX128");
          return {
            amountIn: ethers.constants.Zero,
            amountOut: ethers.constants.Zero,
          };
        }
      }

      while (true) {
        const amountInGuess = amountInLower.add(amountInUpper).div(2);
        // console.log(
        //   "in boundedBinarySearch, while iter",
        //   formatUsdc(amountInGuess),
        //   formatUsdc(amountInLower),
        //   formatUsdc(amountInUpper)
        // );
        let amountOut = await uniswapV3QuoterV1.callStatic.quoteExactInput(
          path,
          amountInGuess
        );

        if (
          amountInGuess.eq(amountInLower) ||
          amountInGuess.eq(amountInUpper)
        ) {
          return { amountIn: amountInGuess, amountOut };
        }

        const priceGuessX128 = isSell
          ? Q128.mul(amountOut).div(amountInGuess)
          : Q128.mul(amountInGuess).div(amountOut);
        // console.log(
        //   "after swap",
        //   fromQ128(priceGuessX128),
        //   fromQ128(targetPriceX128)
        // );

        if (priceGuessX128.lt(targetPriceX128)) {
          amountInLower = amountInGuess;
        } else {
          amountInUpper = amountInGuess;
        }
      }
    }
  }
}
