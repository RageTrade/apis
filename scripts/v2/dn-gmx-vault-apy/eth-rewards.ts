import "isomorphic-unfetch";
import { getProvider } from "../../../providers";
import { formatEther, formatUnits } from "ethers/lib/utils";
import {
  chainlink,
  deltaNeutralGmxVaults,
  formatUsdc,
  gmxProtocol,
  NetworkName,
} from "@ragetrade/sdk";

import { ethers } from "ethers";

export const getEthRewards = async (networkName: NetworkName) => {
  const provider = getProvider(networkName);
  const { dnGmxJuniorVault, dnGmxSeniorVault } =
    await deltaNeutralGmxVaults.getContractsSync(networkName, provider);
  const { sGLP, glp } = await gmxProtocol.getContractsSync(
    networkName,
    provider
  );
  const { ethUsdAggregator } = chainlink.getContractsSync(
    networkName,
    provider
  );
  const feeGlpTrackerAddress = await sGLP.feeGlpTracker();
  const feeGlpTracker = new ethers.Contract(
    feeGlpTrackerAddress,
    ["function tokensPerInterval() external view returns (uint256)"],
    provider
  );

  const { answer } = await ethUsdAggregator.latestRoundData();
  const ethPrice = Number(formatUnits(answer, 8));
  const tokensPerInterval = Number(
    formatEther(await feeGlpTracker.tokensPerInterval())
  );
  const SECONDS_PER_YEAR = 31536000;

  const feeGlpTrackerAnnualRewardsUsd =
    tokensPerInterval * SECONDS_PER_YEAR * ethPrice;

  const glp_totalSupply = Number(formatEther(await glp.totalSupply()));

  const glpPrice = Number(formatEther(await dnGmxJuniorVault.getPrice(false)));

  const glpSupplyUsd = glp_totalSupply * glpPrice;

  const glpAprForNativeToken = feeGlpTrackerAnnualRewardsUsd / glpSupplyUsd;

  const gmxYieldUi = glpAprForNativeToken;
  const protocolFee = 0.185;

  const jrTvl = Number(
    formatUsdc(await dnGmxJuniorVault.getVaultMarketValue())
  );
  const srTvl = Number(
    formatUsdc(await dnGmxSeniorVault.getVaultMarketValue())
  );

  const rewardsToCompound = gmxYieldUi * jrTvl * (1 - protocolFee);

  const totalAssets = await dnGmxSeniorVault.totalAssets();
  const totalBorrowed = await dnGmxSeniorVault.totalUsdcBorrowed();

  let currentUtilRate = totalBorrowed.mul(10_000).div(totalAssets).toNumber();
  currentUtilRate = currentUtilRate / 10_000;

  const srVaultFeeShare = Number(
    formatUnits(await dnGmxSeniorVault.getEthRewardsSplitRate(), 30)
  );

  const jrRewardsHarvested = rewardsToCompound * (1 - srVaultFeeShare);

  const srRewardsHarvested = rewardsToCompound * srVaultFeeShare;

  const jrRewardsAPY = jrRewardsHarvested / jrTvl;
  const srRewardsAPY = srRewardsHarvested / srTvl;

  return [jrRewardsAPY * 100, srRewardsAPY * 100];
};
