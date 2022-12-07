import fetch from "isomorphic-unfetch";

import { BigNumber, Contract } from "ethers";
import { formatEther, formatUnits } from "ethers/lib/utils";
import { getProvider } from "../../../providers";
import {
  gmxProtocol,
  NetworkName,
  deltaNeutralGmxVaults,
  tokens,
  typechain,
} from "@ragetrade/sdk";

import RewardTracker from "./RewardTracker.json";

const provMain = getProvider("arbmain");

const addrEsGmx = "0x908C4D94D34924765f1eDc22A1DD098397c59dD4";
const addrStakedGlpTracker = "0x1aDDD80E6039594eE970E5872D247bf0414C8903";
const addrStakedGmxTracker = "0x908C4D94D34924765f1eDc22A1DD098397c59dD4";

const BASIS_POINTS_DIVISOR = BigNumber.from(10_000);
const SECONDS_PER_YEAR = BigNumber.from(31536000);

const ONE_ETHER = BigNumber.from(10).pow(18);
const PRICE_PRECISION = BigNumber.from(10).pow(30);

export const getEsgmxRewards = async (networkName: NetworkName) => {
  const stakedGlpTracker = new Contract(
    addrStakedGlpTracker,
    RewardTracker.abi,
    provMain
  );
  const stakedGmxTracker = new Contract(
    addrStakedGmxTracker,
    RewardTracker.abi,
    provMain
  );

  const tk = await tokens.getContracts(provMain);
  const dn = await deltaNeutralGmxVaults.getContracts(provMain);
  const gmxContracts = await gmxProtocol.getContracts(provMain);

  const glpAum = await gmxContracts.glpManager.getAum(false);
  const glpSupply = await gmxContracts.glp.totalSupply();

  const glpPrice = glpAum.div(glpSupply);
  // console.log(glpPrice.toString())

  const glpSupplyUsd = glpAum;
  // console.log('glpSupplyUsd', glpSupplyUsd.toString())

  let gmxPrice = (
    await (
      await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=gmx&vs_currencies=usd"
      )
    ).json()
  ).gmx.usd;

  gmxPrice = BigNumber.from(
    (gmxPrice * BASIS_POINTS_DIVISOR.toNumber()).toFixed(0)
  );
  // console.log("gmxPrice", gmxPrice.toString())

  const stakedGmxTrackerSupplyUsd = (await stakedGmxTracker.totalSupply()).mul(
    gmxPrice
  );
  // console.log('stakedGmxTrackerSupplyUsd', stakedGmxTrackerSupplyUsd.toString())

  const tokensPerIntervalGlp = await stakedGlpTracker.tokensPerInterval();
  const tokensPerIntervalGmx = await stakedGmxTracker.tokensPerInterval();
  // console.log('tokensPerIntervalGlp', tokensPerIntervalGlp)
  // console.log('tokensPerIntervalGmx', tokensPerIntervalGmx)

  const stakedGlpTrackerAnnualRewardsUsd = tokensPerIntervalGlp
    .mul(SECONDS_PER_YEAR)
    .mul(gmxPrice)
    .div(ONE_ETHER)
    .div(BASIS_POINTS_DIVISOR);
  // console.log('stakedGlpTrackerAnnualRewardsUsd', stakedGlpTrackerAnnualRewardsUsd.toString())

  const stakedGlpTrackerApr = stakedGlpTrackerAnnualRewardsUsd
    .mul(BigNumber.from(10).pow(30))
    .mul(BASIS_POINTS_DIVISOR)
    .div(glpSupplyUsd);
  // console.log('stakedGlpTrackerApr', stakedGlpTrackerApr.toString())

  const stakedGmxTrackerAnnualRewardsUsd = tokensPerIntervalGmx
    .mul(SECONDS_PER_YEAR)
    .mul(gmxPrice)
    .div(ONE_ETHER);
  // console.log('stakedGmxTrackerAnnualRewardsUsd', stakedGmxTrackerAnnualRewardsUsd.toString())

  const stakedGmxTrackerApr = stakedGmxTrackerAnnualRewardsUsd
    .mul(ONE_ETHER)
    .mul(BASIS_POINTS_DIVISOR)
    .div(stakedGmxTrackerSupplyUsd);
  // console.log('stakedGmxTrackerApr', stakedGmxTrackerApr.toString())

  // ((esGMX-on-GLP-apr x netGLP x glpPrice) + (esGMX-on-esGMX-apr x esGMX x gmxPrice)) / $risk-on-tvl
  const vmv = Number(
    formatUnits(await dn.dnGmxJuniorVault.getVaultMarketValue(), 6)
  );

  const esGmx = typechain.IERC20Metadata__factory.connect(addrEsGmx, provMain);

  const netEsGmxBal = Number(
    formatEther(await esGmx.balanceOf(dn.dnGmxJuniorVault.address))
  );
  const netGlpBal = (
    await tk.fsGLP.balanceOf(dn.dnGmxBatchingManager.address)
  ).add(await tk.fsGLP.balanceOf(dn.dnGmxJuniorVault.address));

  let netGlpInUsd = netGlpBal
    .mul(glpPrice)
    .mul(BASIS_POINTS_DIVISOR)
    .div(PRICE_PRECISION)
    .toNumber();
  netGlpInUsd = netGlpInUsd / BASIS_POINTS_DIVISOR.toNumber();

  const esGmxApyforGlp = stakedGlpTrackerApr.toNumber() / 100;
  const esGmxApyforGmx = stakedGmxTrackerApr.toNumber() / 100;

  const adjustedEsGmxApy =
    vmv > 0
      ? (esGmxApyforGlp * netGlpInUsd +
          esGmxApyforGmx * netEsGmxBal * gmxPrice) /
        vmv
      : 0;

  return adjustedEsGmxApy;
};
