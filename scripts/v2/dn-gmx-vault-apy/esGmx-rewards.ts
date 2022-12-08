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

const getGmxPrice = async () => {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=gmx&vs_currencies=usd"
  );

  let gmxPrice = (await res.json()).gmx.usd;
  return gmxPrice;
};

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
  const esGmx = typechain.IERC20Metadata__factory.connect(addrEsGmx, provMain);

  const [
    tk,
    dn,
    gmxContracts,
    _gmxPrice,
    _stakedGmxTrackerSupplyUsd,
    tokensPerIntervalGlp,
    tokensPerIntervalGmx,
  ] = await Promise.all([
    tokens.getContracts(provMain),
    deltaNeutralGmxVaults.getContracts(provMain),
    gmxProtocol.getContracts(provMain),
    getGmxPrice(),
    stakedGmxTracker.totalSupply(),
    stakedGlpTracker.tokensPerInterval(),
    stakedGmxTracker.tokensPerInterval(),
  ]);

  const [
    glpAum,
    glpSupply,
    _vmv,
    _netEsGmxBal,
    batchingManagerFsGlpBal,
    juniorVaultFsGlpBal,
  ] = await Promise.all([
    gmxContracts.glpManager.getAum(false),
    gmxContracts.glp.totalSupply(),
    dn.dnGmxJuniorVault.getVaultMarketValue(),
    esGmx.balanceOf(dn.dnGmxJuniorVault.address),
    tk.fsGLP.balanceOf(dn.dnGmxBatchingManager.address),
    tk.fsGLP.balanceOf(dn.dnGmxJuniorVault.address),
  ]);

  const vmv = Number(formatUnits(_vmv, 6));
  const netEsGmxBal = Number(formatEther(_netEsGmxBal));

  const netGlpBal = batchingManagerFsGlpBal.add(juniorVaultFsGlpBal);

  const gmxPrice = BigNumber.from(
    (_gmxPrice * BASIS_POINTS_DIVISOR.toNumber()).toFixed(0)
  );
  const glpPrice = glpAum.div(glpSupply);
  const glpSupplyUsd = glpAum;

  const stakedGmxTrackerSupplyUsd = _stakedGmxTrackerSupplyUsd.mul(gmxPrice);

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

  // ((esGMX-on-GLP-apr x netGLP x glpPrice) + (esGMX-on-esGMX-apr x esGMX x gmxPrice)) / $risk-on-tvl

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
          esGmxApyforGmx * netEsGmxBal * _gmxPrice) /
        vmv
      : 0;

  return adjustedEsGmxApy;
};
