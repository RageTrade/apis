import "isomorphic-unfetch";
import { BigNumber } from "ethers";
import { getProvider } from "../../../providers";
import { formatUnits, hexZeroPad } from "ethers/lib/utils";
import { deltaNeutralGmxVaults, formatUsdc, NetworkName } from "@ragetrade/sdk";

const getEthPrice = async () => {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
  );

  const ethPrice = (await res.json()).ethereum.usd;

  return ethPrice;
};

export const getEthRewards = async (networkName: NetworkName) => {
  const provider = getProvider(networkName);
  const dn = await deltaNeutralGmxVaults.getContracts(provider);

  const gmxYieldUi = 0.1572;
  const protocolFee = 0.185;

  const jrTvl = Number(
    formatUsdc(await dn.dnGmxJuniorVault.getVaultMarketValue())
  );
  const srTvl = Number(
    formatUsdc(await dn.dnGmxSeniorVault.getVaultMarketValue())
  );

  const rewardsToCompound = gmxYieldUi * jrTvl * (1 - protocolFee);

  const totalAssets = await dn.dnGmxSeniorVault.totalAssets();
  const totalBorrowed = await dn.dnGmxSeniorVault.totalUsdcBorrowed();

  let currentUtilRate = totalBorrowed.mul(10_000).div(totalAssets).toNumber();
  currentUtilRate = currentUtilRate / 10_000;

  const srVaultFeeShare = Number(
    formatUnits(await dn.dnGmxSeniorVault.getEthRewardsSplitRate(), 30)
  );

  const jrRewardsHarvested = rewardsToCompound * (1 - srVaultFeeShare);

  const srRewardsHarvested = rewardsToCompound * srVaultFeeShare;

  const jrRewardsAPY = jrRewardsHarvested / jrTvl;
  const srRewardsAPY = srRewardsHarvested / srTvl;

  return [jrRewardsAPY * 100, srRewardsAPY * 100];
};
