import { formatEther, formatUnits } from "ethers/lib/utils";

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
import { price } from "./util/helpers";

export type GlobalAavePnlEntry = Entry<{
  aavePnl: number;
}>;

export interface GlobalAavePnlResult {
  data: GlobalAavePnlEntry[];
}

export async function getAavePnl(
  networkName: NetworkName
): Promise<GlobalAavePnlResult> {
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

  const data = await parallelizeOverEveryDWR(
    networkName,
    provider,
    async (_i, blockNumber, eventName, transactionHash, logIndex) => {
      const btcAmountBefore = Number(
        formatUnits(
          await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          }),
          8
        )
      );
      const btcAmountAfter = Number(
        formatUnits(
          await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          }),
          8
        )
      );
      const ethAmountBefore = Number(
        formatEther(
          await vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          })
        )
      );
      const ethAmountAfter = Number(
        formatEther(
          await vdWeth.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          })
        )
      );
      const btcPrice = await price(wbtc.address, blockNumber, networkName);
      const ethPrice = await price(weth.address, blockNumber, networkName);

      return {
        blockNumber,
        eventName,
        transactionHash,
        logIndex,
        btcAmountBefore,
        btcAmountAfter,
        ethAmountBefore,
        ethAmountAfter,
        btcPrice,
        ethPrice,
      };
    }
  );

  const extraData: Entry<{ aavePnl: number }>[] = [];

  let last;
  for (const current of data) {
    if (last) {
      let aavePnl = 0;
      aavePnl -=
        current.btcAmountBefore * current.btcPrice -
        last.btcAmountAfter * last.btcPrice;
      aavePnl -=
        current.ethAmountBefore * current.ethPrice -
        last.ethAmountAfter * last.ethPrice;

      extraData.push({
        blockNumber: current.blockNumber,
        eventName: current.eventName,
        transactionHash: current.transactionHash,
        logIndex: current.logIndex,

        aavePnl,
      });
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        eventName: current.eventName,
        transactionHash: current.transactionHash,
        logIndex: current.logIndex,
        aavePnl: 0,
      });
    }
    last = current;
  }

  // combines both information
  return { data: combine(data, extraData, (a, b) => ({ ...a, ...b })) };
}
