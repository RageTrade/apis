import {
  aave,
  chainlink,
  deltaNeutralGmxVaults,
  gmxProtocol,
  NetworkName,
  tokens,
} from "@ragetrade/sdk";
import { BigNumber, ethers } from "ethers";
import { formatEther, formatUnits } from "ethers/lib/utils";
import { getProviderAggregate } from "../../providers";
import { days, mins } from "../../utils";
import { juniorVault } from "../aggregated/util/events";
import { getLogsInLoop, price } from "../aggregated/util/helpers";
import { parallelize } from "../aggregated/util/parallelize";

export async function perInterval2(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName);

  const { dnGmxJuniorVault, dnGmxBatchingManager } =
    deltaNeutralGmxVaults.getContractsSync(networkName, provider);
  const { gmxUnderlyingVault, glpManager } = gmxProtocol.getContractsSync(
    networkName,
    provider
  );
  // const allWhitelistedTokensLength = (
  //   await gmxUnderlyingVault.allWhitelistedTokensLength()
  // ).toNumber();
  // const allWhitelistedTokens: string[] = [];
  // for (let i = 0; i < allWhitelistedTokensLength; i++) {
  //   allWhitelistedTokens.push(await gmxUnderlyingVault.allWhitelistedTokens(i));
  // }
  const { weth, wbtc, fsGLP, glp } = tokens.getContractsSync(
    networkName,
    provider
  );

  const { wbtcVariableDebtTokenAddress, wethVariableDebtTokenAddress } =
    aave.getAddresses(networkName);
  const { aUsdc } = aave.getContractsSync(networkName, provider);
  const vdWbtc = aUsdc.attach(wbtcVariableDebtTokenAddress);
  const vdWeth = aUsdc.attach(wethVariableDebtTokenAddress);

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

  const iface = [
    "function positions(bytes32 key) external view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 reserveAmount, int256 realisedPnl, uint256 lastIncreasedTime)",
    "function getGlobalShortAveragePrice(address _token) public view returns (uint256)",
  ];

  const newGlpManager = new ethers.Contract(
    glpManager.address,
    iface,
    provider
  );

  const tokensArr = [
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
  ];

  // const startBlock = 27679448; // Oct 1
  // const endBlock = 50084140; // Dec 31
  // const startBlock = 50084140; // Oct 1
  // const endBlock = await provider.getBlockNumber();
  // const interval = 2000; // 497; // Math.floor(((endBlock - startBlock) * 3 * mins) / days);

  // LeadDev — Today at 7:36 AM
  // 7:36

  const startBlock = 47916819;
  // const endBlock = 47917019;
  const endBlock = 55725409;
  const interval = 200;

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: () => {
        const events = [];
        for (let i = startBlock; i <= endBlock; i += interval) {
          events.push({
            blockNumber: i,
          });
        }
        return events as ethers.Event[];
      },
      ignoreMoreEventsInSameBlock: true,
    },
    async (_i, blockNumber) => {
      const block = await provider.getBlock(blockNumber);

      const _globalShortAvgSize_eth = await gmxUnderlyingVault.globalShortSizes(
        tokensArr[0],
        { blockTag: blockNumber }
      );
      const _globalShortAvgPrice_eth =
        await newGlpManager.getGlobalShortAveragePrice(tokensArr[0], {
          blockTag: blockNumber,
        });
      const _reservedAmount_eth = await gmxUnderlyingVault.reservedAmounts(
        tokensArr[0],
        { blockTag: blockNumber }
      );
      const _poolAmount_eth = await gmxUnderlyingVault.poolAmounts(
        tokensArr[0],
        { blockTag: blockNumber }
      );

      const _globalShortAvgSize_btc = await gmxUnderlyingVault.globalShortSizes(
        tokensArr[1],
        { blockTag: blockNumber }
      );
      const _globalShortAvgPrice_btc =
        await newGlpManager.getGlobalShortAveragePrice(tokensArr[1], {
          blockTag: blockNumber,
        });
      const _reservedAmount_btc = await gmxUnderlyingVault.reservedAmounts(
        tokensArr[1],
        { blockTag: blockNumber }
      );
      const _poolAmount_btc = await gmxUnderlyingVault.poolAmounts(
        tokensArr[1],
        { blockTag: blockNumber }
      );

      return {
        blockNumber,
        timestamp: block.timestamp,

        globalShortAvgSize_eth: Number(
          formatUnits(_globalShortAvgSize_eth, 30)
        ),
        globalShortAvgPrice_eth: Number(
          formatUnits(_globalShortAvgPrice_eth, 30)
        ),
        reservedAmount_eth: Number(formatUnits(_reservedAmount_eth)),
        poolAmount_eth: Number(formatUnits(_poolAmount_eth)),
        globalShortAvgSize_btc: Number(
          formatUnits(_globalShortAvgSize_btc, 30)
        ),
        globalShortAvgPrice_btc: Number(
          formatUnits(_globalShortAvgPrice_btc, 30)
        ),
        reservedAmount_btc: Number(formatUnits(_reservedAmount_btc)),
        poolAmount_btc: Number(formatUnits(_poolAmount_btc)),
      };
    }
  );

  return data;
}
