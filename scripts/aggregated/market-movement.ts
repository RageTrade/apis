import {
  aave,
  chainlink,
  deltaNeutralGmxVaults,
  gmxProtocol,
  NetworkName,
  tokens,
} from "@ragetrade/sdk";
import { BigNumber, ethers } from "ethers";
import { formatEther, formatUnits, parseEther } from "ethers/lib/utils";
import { getProviderAggregate } from "../../providers";
import { days, mins, timestampRoundDown } from "../../utils";
import { intersection } from "./util/combine";
import { gmxVault, juniorVault } from "./util/events";
import { price } from "./util/helpers";
import { parallelize } from "./util/parallelize";
import { Entry } from "./util/types";

export type GlobalMarketMovementEntry = Entry<{
  timestamp: number;

  fsGlp_balanceOf_juniorVault: number;
  fsGlp_balanceOf_batchingManager: number;
  glp_totalSupply: number;
  vaultGlp: number;
  glpPrice: number;
  wethUsdgAmount: number;
  wbtcUsdgAmount: number;
  linkUsdgAmount: number;
  uniUsdgAmount: number;
  totalUsdcAmount: number;
  wethTokenWeight: number;
  wbtcTokenWeight: number;
  linkTokenWeight: number;
  uniTokenWeight: number;
  wethPrice: number;
  wbtcPrice: number;
  linkPrice: number;
  uniPrice: number;
  wethCurrentToken: number;
  wbtcCurrentToken: number;
  linkCurrentToken: number;
  uniCurrentToken: number;

  ethPnl: number;
  btcPnl: number;
  linkPnl: number;
  uniPnl: number;
  pnl: number;
}>;

export interface GlobalMarketMovementDailyEntry {
  startTimestamp: number;
  endTimestamp: number;
  ethPnlNet: number;
  btcPnlNet: number;
  linkPnlNet: number;
  uniPnlNet: number;
  pnlNet: number;
}
export interface GlobalMarketMovementResult {
  data: GlobalMarketMovementEntry[];
  dailyData: GlobalMarketMovementDailyEntry[];
  totalEthPnl: number;
  totalBtcPnl: number;
  totalLinkPnl: number;
  totalUniPnl: number;
  totalPnl: number;
}

export async function getMarketMovement(
  networkName: NetworkName
): Promise<GlobalMarketMovementResult> {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(
    networkName,
    provider
  );
  const { weth, wbtc, fsGLP, glp } = tokens.getContractsSync(
    networkName,
    provider
  );
  const { ethUsdAggregator } = chainlink.getContractsSync(
    networkName,
    provider
  );

  // LINK / USD: https://arbiscan.io/address/0x86E53CF1B870786351Da77A57575e79CB55812CB
  // UNI / USD: https://arbiscan.io/address/0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720

  const link = wbtc.attach("0xf97f4df75117a78c1A5a0DBb814Af92458539FB4");
  const uni = wbtc.attach("0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0");
  const linkUsdAggregator = ethUsdAggregator.attach(
    "0x86E53CF1B870786351Da77A57575e79CB55812CB"
  );
  const uniUsdAggregator = ethUsdAggregator.attach(
    "0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720"
  );

  const allWhitelistedTokensLength = (
    await gmxUnderlyingVault.allWhitelistedTokensLength()
  ).toNumber();
  const allWhitelistedTokens: string[] = [];
  for (let i = 0; i < allWhitelistedTokensLength; i++) {
    allWhitelistedTokens.push(await gmxUnderlyingVault.allWhitelistedTokens(i));
  }

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        juniorVault.deposit,
        juniorVault.withdraw,
        juniorVault.rebalanced,
        gmxVault.increaseUsdgAmount,
        gmxVault.decreaseUsdgAmount,
      ],
      ignoreMoreEventsInSameBlock: true,
      startBlockNumber: 45412307,
    },
    async (_i, blockNumber) => {
      const block = await provider.getBlock(blockNumber);
      const usdgAmounts = await Promise.all(
        allWhitelistedTokens.map((token) =>
          gmxUnderlyingVault.usdgAmounts(token, { blockTag: blockNumber })
        )
      );

      const wethUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(weth.address, {
            blockTag: blockNumber,
          })
        )
      );
      const wbtcUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(wbtc.address, {
            blockTag: blockNumber,
          })
        )
      );
      const linkUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(link.address, {
            blockTag: blockNumber,
          })
        )
      );
      const uniUsdgAmount = Number(
        formatEther(
          await gmxUnderlyingVault.usdgAmounts(uni.address, {
            blockTag: blockNumber,
          })
        )
      );

      const totalUsdcAmount = Number(
        formatEther(usdgAmounts.reduce((a, b) => a.add(b), BigNumber.from(0)))
      );

      const wethTokenWeight = wethUsdgAmount / totalUsdcAmount;
      const wbtcTokenWeight = wbtcUsdgAmount / totalUsdcAmount;
      const linkTokenWeight = linkUsdgAmount / totalUsdcAmount;
      const uniTokenWeight = uniUsdgAmount / totalUsdcAmount;

      const glpPrice = Number(
        formatEther(
          await dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber,
          })
        )
      );

      const wethPrice = await price(weth.address, blockNumber, networkName);
      const wbtcPrice = await price(wbtc.address, blockNumber, networkName);
      const linkPrice = Number(
        formatUnits(
          (
            await linkUsdAggregator.latestRoundData({
              blockTag: blockNumber,
            })
          ).answer,
          8
        )
      );
      const uniPrice = Number(
        formatUnits(
          (
            await uniUsdAggregator.latestRoundData({
              blockTag: blockNumber,
            })
          ).answer,
          8
        )
      );
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

      // this is not used, but here for reference in output data
      const glp_totalSupply = Number(
        formatEther(
          await glp.totalSupply({
            blockTag: blockNumber,
          })
        )
      );

      const vaultGlp =
        fsGlp_balanceOf_juniorVault + fsGlp_balanceOf_batchingManager;

      const wethCurrentToken =
        (wethTokenWeight * vaultGlp * glpPrice) / wethPrice;
      const wbtcCurrentToken =
        (wbtcTokenWeight * vaultGlp * glpPrice) / wbtcPrice;
      const linkCurrentToken =
        (linkTokenWeight * vaultGlp * glpPrice) / linkPrice;
      const uniCurrentToken = (uniTokenWeight * vaultGlp * glpPrice) / uniPrice;

      return {
        blockNumber: blockNumber,
        timestamp: block.timestamp,
        fsGlp_balanceOf_juniorVault,
        fsGlp_balanceOf_batchingManager,
        glp_totalSupply,
        vaultGlp,
        glpPrice,
        wethUsdgAmount,
        wbtcUsdgAmount,
        linkUsdgAmount,
        uniUsdgAmount,
        totalUsdcAmount,
        wethTokenWeight,
        wbtcTokenWeight,
        linkTokenWeight,
        uniTokenWeight,
        wethPrice,
        wbtcPrice,
        linkPrice,
        uniPrice,
        wethCurrentToken,
        wbtcCurrentToken,
        linkCurrentToken,
        uniCurrentToken,
      };
    }
  );

  const extraData: Entry<{
    ethPnl: number;
    btcPnl: number;
    uniPnl: number;
    linkPnl: number;
    pnl: number;
  }>[] = [];

  let last;
  for (const current of data) {
    if (last) {
      const ethPnl =
        last.wethCurrentToken * (current.wethPrice - last.wethPrice);
      const btcPnl =
        last.wbtcCurrentToken * (current.wbtcPrice - last.wbtcPrice);
      const uniPnl = last.uniCurrentToken * (current.uniPrice - last.uniPrice);
      const linkPnl =
        last.linkCurrentToken * (current.linkPrice - last.linkPrice);

      extraData.push({
        blockNumber: current.blockNumber,
        ethPnl,
        btcPnl,
        uniPnl,
        linkPnl,
        pnl: ethPnl + btcPnl + uniPnl + linkPnl,
      });
    } else {
      extraData.push({
        blockNumber: current.blockNumber,
        ethPnl: 0,
        btcPnl: 0,
        uniPnl: 0,
        linkPnl: 0,
        pnl: 0,
      });
    }
    last = current;
  }

  const combinedData = intersection(data, extraData, (a, b) => ({
    ...a,
    ...b,
  }));

  return {
    data: combinedData,
    dailyData: combinedData.reduce(
      (
        acc: GlobalMarketMovementDailyEntry[],
        cur: GlobalMarketMovementEntry
      ) => {
        let lastEntry = acc[acc.length - 1];
        if (lastEntry && cur.timestamp <= lastEntry.endTimestamp) {
          lastEntry.btcPnlNet += cur.btcPnl;
          lastEntry.ethPnlNet += cur.ethPnl;
          lastEntry.uniPnlNet += cur.uniPnl;
          lastEntry.linkPnlNet += cur.linkPnl;
          lastEntry.pnlNet += cur.pnl;
        } else {
          while (
            lastEntry &&
            lastEntry.startTimestamp + 1 * days <
              timestampRoundDown(cur.timestamp)
          ) {
            acc.push({
              startTimestamp: lastEntry.startTimestamp + 1 * days,
              endTimestamp: lastEntry.startTimestamp + 2 * days - 1,
              btcPnlNet: 0,
              ethPnlNet: 0,
              uniPnlNet: 0,
              linkPnlNet: 0,
              pnlNet: 0,
            });
            lastEntry = acc[acc.length - 1];
          }
          acc.push({
            startTimestamp: timestampRoundDown(cur.timestamp),
            endTimestamp: timestampRoundDown(cur.timestamp) + 1 * days - 1,
            btcPnlNet: cur.btcPnl,
            ethPnlNet: cur.ethPnl,
            uniPnlNet: cur.uniPnl,
            linkPnlNet: cur.linkPnl,
            pnlNet: cur.pnl,
          });
        }
        return acc;
      },
      []
    ),
    totalBtcPnl: combinedData.reduce((acc, cur) => acc + cur.btcPnl, 0),
    totalEthPnl: combinedData.reduce((acc, cur) => acc + cur.ethPnl, 0),
    totalUniPnl: combinedData.reduce((acc, cur) => acc + cur.uniPnl, 0),
    totalLinkPnl: combinedData.reduce((acc, cur) => acc + cur.linkPnl, 0),
    totalPnl: combinedData.reduce((acc, cur) => acc + cur.pnl, 0),
  };
}
