import { fetchJson, formatEther, formatUnits } from "ethers/lib/utils";

import {
  aave,
  deltaNeutralGmxVaults,
  formatUsdc,
  NetworkName,
  typechain,
} from "@ragetrade/sdk";

import { getProviderAggregate } from "../../providers";

import { decimals, price } from "./util/helpers";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";

import type { TokenSwappedEvent } from "@ragetrade/sdk/dist/typechain/delta-neutral-gmx-vaults/contracts/libraries/DnGmxJuniorVaultManager";
import { juniorVault } from "./util/events";

export type RebalanceInfoEntry = Entry<{
  blockNumber: number;
  timestamp: number;
  btcAmountBefore: number;
  btcAmountAfter: number;
  ethAmountBefore: number;
  ethAmountAfter: number;
  uniswapVolume: number;
  aUsdcJuniorBefore: number;
  aUsdcJuniorAfter: number;
  aUsdcSeniorBefore: number;
  aUsdcSeniorAfter: number;
  aaveHealthFactor: number;
}>;

export interface RebalanceInfoResult {
  data: RebalanceInfoEntry[];
  dataLength: number;
}

export async function getRebalanceInfo(
  networkName: NetworkName
): Promise<RebalanceInfoResult> {
  const provider = getProviderAggregate(networkName);

  const { aUsdc, poolAddressProvider } = aave.getContractsSync(
    networkName,
    provider
  );

  const aavePool = typechain.deltaNeutralGmxVaults.IPool__factory.connect(
    await poolAddressProvider.getPool(),
    provider
  );

  const { dnGmxJuniorVault, dnGmxSeniorVault } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);

  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName);
  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress);
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress);

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [juniorVault.rebalanced],
      startBlockNumber: 45412307,
    },
    async (_i, blockNumber, event) => {
      const block = await provider.getBlock(blockNumber);
      const timestamp = block.timestamp;

      // starting borrow amounts, end borrow amounts

      // ?

      // AAVE additional borrows

      const _btcAmountBefore = await vdWbtc.balanceOf(
        dnGmxJuniorVault.address,
        { blockTag: blockNumber - 1 }
      );
      const btcAmountBefore = Number(formatUnits(_btcAmountBefore, 8));

      const _btcAmountAfter = await vdWbtc.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber,
      });
      const btcAmountAfter = Number(formatUnits(_btcAmountAfter, 8));

      const _ethAmountBefore = await vdWeth.balanceOf(
        dnGmxJuniorVault.address,
        { blockTag: blockNumber - 1 }
      );
      const ethAmountBefore = Number(formatUnits(_ethAmountBefore, 18));

      const _ethAmountAfter = await vdWeth.balanceOf(dnGmxJuniorVault.address, {
        blockTag: blockNumber,
      });
      const ethAmountAfter = Number(formatUnits(_ethAmountAfter, 18));

      // Uniswap swap size

      const rc = await provider.getTransactionReceipt(event.transactionHash);
      const filter = dnGmxJuniorVault.filters.TokenSwapped();
      const parsed = rc.logs
        .filter((log) => log.topics[0] === filter.topics?.[0])
        .map((log) =>
          dnGmxJuniorVault.interface.parseLog(log)
        ) as unknown as TokenSwappedEvent[];

      let uniswapVolume = 0;

      for (const event of parsed) {
        const fromPrice = await price(
          event.args.fromToken,
          blockNumber,
          networkName
        );

        const fromQuantity = Number(
          formatUnits(
            event.args.fromQuantity,
            decimals(event.args.fromToken, networkName)
          )
        );

        const fromDollar = fromPrice * fromQuantity;
        uniswapVolume += fromDollar;
      }

      // aave usdc collateral

      const aUsdcJuniorBefore = Number(
        formatUsdc(
          await aUsdc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber - 1,
          })
        )
      );
      const aUsdcJuniorAfter = Number(
        formatUsdc(
          await aUsdc.balanceOf(dnGmxJuniorVault.address, {
            blockTag: blockNumber,
          })
        )
      );

      const aUsdcSeniorBefore = Number(
        formatUsdc(
          await aUsdc.balanceOf(dnGmxSeniorVault.address, {
            blockTag: blockNumber - 1,
          })
        )
      );
      const aUsdcSeniorAfter = Number(
        formatUsdc(
          await aUsdc.balanceOf(dnGmxSeniorVault.address, {
            blockTag: blockNumber,
          })
        )
      );

      // aave health factor

      const userData = await aavePool.getUserAccountData(
        dnGmxJuniorVault.address,
        { blockTag: blockNumber }
      );

      return {
        blockNumber,
        timestamp,
        // starting borrow amounts, end borrow amounts
        // ?
        // AAVE additional borrows
        btcAmountBefore,
        btcAmountAfter,
        ethAmountBefore,
        ethAmountAfter,
        // uniswap swap sizes
        uniswapVolume,
        // aave usdc collateral
        aUsdcJuniorBefore,
        aUsdcJuniorAfter,
        aUsdcSeniorBefore,
        aUsdcSeniorAfter,
        // aave health factor
        aaveHealthFactor: Number(formatEther(userData.healthFactor)),
      };
    }
  );

  return { data, dataLength: data.length };
}
