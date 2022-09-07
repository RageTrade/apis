import { ethers } from "ethers";

import { Token as UniToken } from "@uniswap/sdk-core";
import { Pool } from "@uniswap/v3-sdk";

import GlpManager from "./abis/GlpManager.json";
import ReaderV2 from "./abis/ReaderV2.json";
import RewardReader from "./abis/RewardReader.json";
import Token from "./abis/Token.json";
import UniPool from "./abis/UniPool.json";
import Vault from "./abis/Vault.json";
import { getContract } from "./Addresses";

import "../../fetch-polyfill";

const chainId = 42161;

const LABEL = "APR";
const GLP_DECIMALS = 18;
const BASIS_POINTS_DIVISOR = 10000;
const SECONDS_PER_YEAR = 31536000;

export function getServerUrl(chainId: any, path: any) {
  return `https://gmx-server-mainnet.uw.r.appspot.com/${path}`;
}

export const parseValue = (value: any, tokenDecimals: any) => {
  const pValue = parseFloat(value);
  if (isNaN(pValue)) {
    return undefined;
  }
  value = limitDecimals(value, tokenDecimals);
  const amount = ethers.utils.parseUnits(value, tokenDecimals);
  return bigNumberify(amount);
};

export function bigNumberify(n: any) {
  try {
    return ethers.BigNumber.from(n);
  } catch (e) {
    console.error("bigNumberify error", e);
    return undefined;
  }
}

export function numberWithCommas(x: any) {
  if (!x) {
    return "...";
  }
  var parts = x.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

export const formatAmount = (
  amount: any,
  tokenDecimals: any,
  displayDecimals: any,
  useCommas: any,
  defaultValue: any
) => {
  if (!defaultValue) {
    defaultValue = "...";
  }
  if (amount === undefined || amount.toString().length === 0) {
    return defaultValue;
  }
  if (displayDecimals === undefined) {
    displayDecimals = 4;
  }
  let amountStr = ethers.utils.formatUnits(amount, tokenDecimals);
  amountStr = limitDecimals(amountStr, displayDecimals);
  if (displayDecimals !== 0) {
    amountStr = padDecimals(amountStr, displayDecimals);
  }
  if (useCommas) {
    return numberWithCommas(amountStr);
  }
  return amountStr;
};

export function expandDecimals(n: any, decimals: any) {
  return bigNumberify(n)!.mul(bigNumberify(10)!.pow(decimals));
}

export const limitDecimals = (amount: any, maxDecimals: any) => {
  let amountStr = amount.toString();
  if (maxDecimals === undefined) {
    return amountStr;
  }
  if (maxDecimals === 0) {
    return amountStr.split(".")[0];
  }
  const dotIndex = amountStr.indexOf(".");
  if (dotIndex !== -1) {
    let decimals = amountStr.length - dotIndex - 1;
    if (decimals > maxDecimals) {
      amountStr = amountStr.substr(
        0,
        amountStr.length - (decimals - maxDecimals)
      );
    }
  }
  return amountStr;
};

export const padDecimals = (amount: any, minDecimals: any) => {
  let amountStr = amount.toString();
  const dotIndex = amountStr.indexOf(".");
  if (dotIndex !== -1) {
    const decimals = amountStr.length - dotIndex - 1;
    if (decimals < minDecimals) {
      amountStr = amountStr.padEnd(
        amountStr.length + (minDecimals - decimals),
        "0"
      );
    }
  } else {
    amountStr = amountStr + ".0000";
  }
  return amountStr;
};

export const formatKeyAmount = (
  map: any,
  key: any,
  tokenDecimals: any,
  displayDecimals: any,
  useCommas: any
) => {
  let formatted: any = {};

  for (const key of Object.keys(map)) {
    formatted[key] = formatAmount(
      map[key],
      tokenDecimals,
      displayDecimals,
      useCommas,
      undefined
    );
  }

  return formatted;
};

export function getBalanceAndSupplyData(balances: any) {
  if (!balances || balances.length === 0) {
    return {};
  }

  const keys = ["gmx", "esGmx", "glp", "stakedGmxTracker"];
  const balanceData: any = {};
  const supplyData: any = {};
  const propsLength = 2;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    balanceData[key] = balances[i * propsLength];
    supplyData[key] = balances[i * propsLength + 1];
  }

  return { balanceData, supplyData };
}

export function getDepositBalanceData(depositBalances: any) {
  if (!depositBalances || depositBalances.length === 0) {
    return;
  }

  const keys = [
    "gmxInStakedGmx",
    "esGmxInStakedGmx",
    "stakedGmxInBonusGmx",
    "bonusGmxInFeeGmx",
    "bnGmxInFeeGmx",
    "glpInStakedGlp",
  ];
  const data: any = {};

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    data[key] = depositBalances[i];
  }

  return data;
}

export function getVestingData(vestingInfo: any) {
  if (!vestingInfo || vestingInfo.length === 0) {
    return;
  }

  const keys = ["gmxVester", "glpVester"];
  const data: any = {};
  const propsLength = 7;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    data[key] = {
      pairAmount: vestingInfo[i * propsLength],
      vestedAmount: vestingInfo[i * propsLength + 1],
      escrowedBalance: vestingInfo[i * propsLength + 2],
      claimedAmounts: vestingInfo[i * propsLength + 3],
      claimable: vestingInfo[i * propsLength + 4],
      maxVestableAmount: vestingInfo[i * propsLength + 5],
      averageStakedAmount: vestingInfo[i * propsLength + 6],
    };

    data[key + "PairAmount"] = data[key].pairAmount;
    data[key + "VestedAmount"] = data[key].vestedAmount;
    data[key + "EscrowedBalance"] = data[key].escrowedBalance;
    data[key + "ClaimSum"] = data[key].claimedAmounts.add(data[key].claimable);
    data[key + "Claimable"] = data[key].claimable;
    data[key + "MaxVestableAmount"] = data[key].maxVestableAmount;
    data[key + "AverageStakedAmount"] = data[key].averageStakedAmount;
  }

  return data;
}

export function getStakingData(stakingInfo: any) {
  if (!stakingInfo || stakingInfo.length === 0) {
    return;
  }

  const keys = [
    "stakedGmxTracker",
    "bonusGmxTracker",
    "feeGmxTracker",
    "stakedGlpTracker",
    "feeGlpTracker",
  ];
  const data: any = {};
  const propsLength = 5;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    data[key] = {
      claimable: stakingInfo[i * propsLength],
      tokensPerInterval: stakingInfo[i * propsLength + 1],
      averageStakedAmounts: stakingInfo[i * propsLength + 2],
      cumulativeRewards: stakingInfo[i * propsLength + 3],
      totalSupply: stakingInfo[i * propsLength + 4],
    };
  }

  return data;
}

export function getProcessedData(
  balanceData: any,
  supplyData: any,
  depositBalanceData: any,
  stakingData: any,
  vestingData: any,
  aum: any,
  nativeTokenPrice: any,
  stakedGmxSupply: any,
  gmxPrice: any,
  gmxSupply: any
) {
  if (
    !balanceData ||
    !supplyData ||
    !depositBalanceData ||
    !stakingData ||
    !vestingData ||
    !aum ||
    !nativeTokenPrice ||
    !stakedGmxSupply ||
    !gmxPrice ||
    !gmxSupply
  ) {
    return {};
  }

  const data: any = {};

  data.gmxBalance = balanceData.gmx;
  data.gmxBalanceUsd = balanceData.gmx.mul(gmxPrice).div(expandDecimals(1, 18));

  data.gmxSupply = bigNumberify(gmxSupply);

  data.gmxSupplyUsd = data.gmxSupply.mul(gmxPrice).div(expandDecimals(1, 18));
  data.stakedGmxSupply = stakedGmxSupply;
  data.stakedGmxSupplyUsd = stakedGmxSupply
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));
  data.gmxInStakedGmx = depositBalanceData.gmxInStakedGmx;
  data.gmxInStakedGmxUsd = depositBalanceData.gmxInStakedGmx
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));

  data.esGmxBalance = balanceData.esGmx;
  data.esGmxBalanceUsd = balanceData.esGmx
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));

  data.stakedGmxTrackerSupply = supplyData.stakedGmxTracker;
  data.stakedGmxTrackerSupplyUsd = supplyData.stakedGmxTracker
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));
  data.stakedEsGmxSupply = data.stakedGmxTrackerSupply.sub(
    data.stakedGmxSupply
  );
  data.stakedEsGmxSupplyUsd = data.stakedEsGmxSupply
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));

  data.esGmxInStakedGmx = depositBalanceData.esGmxInStakedGmx;
  data.esGmxInStakedGmxUsd = depositBalanceData.esGmxInStakedGmx
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));

  data.bnGmxInFeeGmx = depositBalanceData.bnGmxInFeeGmx;
  data.bonusGmxInFeeGmx = depositBalanceData.bonusGmxInFeeGmx;
  data.feeGmxSupply = stakingData.feeGmxTracker.totalSupply;
  data.feeGmxSupplyUsd = data.feeGmxSupply
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));

  data.stakedGmxTrackerRewards = stakingData.stakedGmxTracker.claimable;
  data.stakedGmxTrackerRewardsUsd = stakingData.stakedGmxTracker.claimable
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));

  data.bonusGmxTrackerRewards = stakingData.bonusGmxTracker.claimable;

  data.feeGmxTrackerRewards = stakingData.feeGmxTracker.claimable;
  data.feeGmxTrackerRewardsUsd = stakingData.feeGmxTracker.claimable
    .mul(nativeTokenPrice)
    .div(expandDecimals(1, 18));

  data.boostBasisPoints = bigNumberify(0);
  if (
    data &&
    data.bnGmxInFeeGmx &&
    data.bonusGmxInFeeGmx &&
    data.bonusGmxInFeeGmx.gt(0)
  ) {
    data.boostBasisPoints = data.bnGmxInFeeGmx
      .mul(BASIS_POINTS_DIVISOR)
      .div(data.bonusGmxInFeeGmx);
  }

  data.stakedGmxTrackerAnnualRewardsUsd =
    stakingData.stakedGmxTracker.tokensPerInterval
      .mul(SECONDS_PER_YEAR)
      .mul(gmxPrice)
      .div(expandDecimals(1, 18));
  data.gmxAprForEsGmx =
    data.stakedGmxTrackerSupplyUsd && data.stakedGmxTrackerSupplyUsd.gt(0)
      ? data.stakedGmxTrackerAnnualRewardsUsd
          .mul(BASIS_POINTS_DIVISOR)
          .div(data.stakedGmxTrackerSupplyUsd)
      : bigNumberify(0);
  data.feeGmxTrackerAnnualRewardsUsd =
    stakingData.feeGmxTracker.tokensPerInterval
      .mul(SECONDS_PER_YEAR)
      .mul(nativeTokenPrice)
      .div(expandDecimals(1, 18));
  data.gmxAprForNativeToken =
    data.feeGmxSupplyUsd && data.feeGmxSupplyUsd.gt(0)
      ? data.feeGmxTrackerAnnualRewardsUsd
          .mul(BASIS_POINTS_DIVISOR)
          .div(data.feeGmxSupplyUsd)
      : bigNumberify(0);
  data.gmxBoostAprForNativeToken = data.gmxAprForNativeToken
    .mul(data.boostBasisPoints)
    .div(BASIS_POINTS_DIVISOR);
  data.gmxAprTotal = data.gmxAprForNativeToken.add(data.gmxAprForEsGmx);
  data.gmxAprTotalWithBoost = data.gmxAprForNativeToken
    .add(data.gmxBoostAprForNativeToken)
    .add(data.gmxAprForEsGmx);
  data.gmxAprForNativeTokenWithBoost = data.gmxAprForNativeToken.add(
    data.gmxBoostAprForNativeToken
  );

  data.totalGmxRewardsUsd = data.stakedGmxTrackerRewardsUsd.add(
    data.feeGmxTrackerRewardsUsd
  );

  data.glpSupply = supplyData.glp;
  data.glpPrice =
    data.glpSupply && data.glpSupply.gt(0)
      ? aum.mul(expandDecimals(1, GLP_DECIMALS)).div(data.glpSupply)
      : bigNumberify(0);

  data.glpSupplyUsd = supplyData.glp
    .mul(data.glpPrice)
    .div(expandDecimals(1, 18));

  data.glpBalance = depositBalanceData.glpInStakedGlp;
  data.glpBalanceUsd = depositBalanceData.glpInStakedGlp
    .mul(data.glpPrice)
    .div(expandDecimals(1, GLP_DECIMALS));

  data.stakedGlpTrackerRewards = stakingData.stakedGlpTracker.claimable;
  data.stakedGlpTrackerRewardsUsd = stakingData.stakedGlpTracker.claimable
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));

  data.feeGlpTrackerRewards = stakingData.feeGlpTracker.claimable;
  data.feeGlpTrackerRewardsUsd = stakingData.feeGlpTracker.claimable
    .mul(nativeTokenPrice)
    .div(expandDecimals(1, 18));

  data.stakedGlpTrackerAnnualRewardsUsd =
    stakingData.stakedGlpTracker.tokensPerInterval
      .mul(SECONDS_PER_YEAR)
      .mul(gmxPrice)
      .div(expandDecimals(1, 18));
  data.glpAprForEsGmx =
    data.glpSupplyUsd && data.glpSupplyUsd.gt(0)
      ? data.stakedGlpTrackerAnnualRewardsUsd
          .mul(BASIS_POINTS_DIVISOR)
          .div(data.glpSupplyUsd)
      : bigNumberify(0);
  data.feeGlpTrackerAnnualRewardsUsd =
    stakingData.feeGlpTracker.tokensPerInterval
      .mul(SECONDS_PER_YEAR)
      .mul(nativeTokenPrice)
      .div(expandDecimals(1, 18));
  data.glpAprForNativeToken =
    data.glpSupplyUsd && data.glpSupplyUsd.gt(0)
      ? data.feeGlpTrackerAnnualRewardsUsd
          .mul(BASIS_POINTS_DIVISOR)
          .div(data.glpSupplyUsd)
      : bigNumberify(0);
  data.glpAprTotal = data.glpAprForNativeToken.add(data.glpAprForEsGmx);

  data.totalGlpRewardsUsd = data.stakedGlpTrackerRewardsUsd.add(
    data.feeGlpTrackerRewardsUsd
  );

  data.totalEsGmxRewards = data.stakedGmxTrackerRewards.add(
    data.stakedGlpTrackerRewards
  );
  data.totalEsGmxRewardsUsd = data.stakedGmxTrackerRewardsUsd.add(
    data.stakedGlpTrackerRewardsUsd
  );

  data.gmxVesterRewards = vestingData.gmxVester.claimable;
  data.glpVesterRewards = vestingData.glpVester.claimable;
  data.totalVesterRewards = data.gmxVesterRewards.add(data.glpVesterRewards);
  data.totalVesterRewardsUsd = data.totalVesterRewards
    .mul(gmxPrice)
    .div(expandDecimals(1, 18));

  data.totalNativeTokenRewards = data.feeGmxTrackerRewards.add(
    data.feeGlpTrackerRewards
  );
  data.totalNativeTokenRewardsUsd = data.feeGmxTrackerRewardsUsd.add(
    data.feeGlpTrackerRewardsUsd
  );

  data.totalRewardsUsd = data.totalEsGmxRewardsUsd
    .add(data.totalNativeTokenRewardsUsd)
    .add(data.totalVesterRewardsUsd);

  return data;
}

export const getContractCall = async ({
  provider,
  contractInfo,
  arg0,
  arg1,
  method,
  params,
  additionalArgs,
}: any) => {
  const address = arg0;
  const contract = new ethers.Contract(address, contractInfo.abi, provider);

  if (additionalArgs) return contract[method](params, ...additionalArgs);

  return contract[method](params);
};

const main = async (PLACEHOLDER_ACCOUNT: any) => {
  const provider = new ethers.providers.AlchemyWebSocketProvider(
    42161,
    "6MR6NfcycadwIc_hYdFfc1HTTkmi5pFE"
  );

  const rewardReaderAddress = getContract(chainId, "RewardReader");
  const readerAddress = getContract(chainId, "Reader");

  const vaultAddress = getContract(chainId, "Vault");
  const nativeTokenAddress = getContract(chainId, "NATIVE_TOKEN");
  const gmxAddress = getContract(chainId, "GMX");
  const esGmxAddress = getContract(chainId, "ES_GMX");
  const bnGmxAddress = getContract(chainId, "BN_GMX");
  const glpAddress = getContract(chainId, "GLP");

  const stakedGmxTrackerAddress = getContract(chainId, "StakedGmxTracker");
  const bonusGmxTrackerAddress = getContract(chainId, "BonusGmxTracker");
  const feeGmxTrackerAddress = getContract(chainId, "FeeGmxTracker");

  const stakedGlpTrackerAddress = getContract(chainId, "StakedGlpTracker");
  const feeGlpTrackerAddress = getContract(chainId, "FeeGlpTracker");

  const glpManagerAddress = getContract(chainId, "GlpManager");

  const gmxVesterAddress = getContract(chainId, "GmxVester");
  const glpVesterAddress = getContract(chainId, "GlpVester");

  const vesterAddresses = [gmxVesterAddress, glpVesterAddress];

  const poolAddress = getContract(chainId, "UniswapGmxEthPool");

  const walletTokens = [
    gmxAddress,
    esGmxAddress,
    glpAddress,
    stakedGmxTrackerAddress,
  ];

  const ethAddress = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

  const depositTokens = [
    gmxAddress,
    esGmxAddress,
    stakedGmxTrackerAddress,
    bonusGmxTrackerAddress,
    bnGmxAddress,
    glpAddress,
  ];
  const rewardTrackersForDepositBalances = [
    stakedGmxTrackerAddress,
    stakedGmxTrackerAddress,
    bonusGmxTrackerAddress,
    feeGmxTrackerAddress,
    feeGmxTrackerAddress,
    feeGlpTrackerAddress,
  ];
  const rewardTrackersForStakingInfo = [
    stakedGmxTrackerAddress,
    bonusGmxTrackerAddress,
    feeGmxTrackerAddress,
    stakedGlpTrackerAddress,
    feeGlpTrackerAddress,
  ];

  const walletBalances = await getContractCall({
    provider: provider,
    contractInfo: ReaderV2,
    arg0: readerAddress,
    method: "getTokenBalancesWithSupplies",
    params: PLACEHOLDER_ACCOUNT,
    additionalArgs: [walletTokens],
  });

  // console.log("walletBalances", walletBalances);

  const depositBalances = await getContractCall({
    provider: provider,
    contractInfo: RewardReader,
    arg0: rewardReaderAddress,
    method: "getDepositBalances",
    params: PLACEHOLDER_ACCOUNT,
    additionalArgs: [depositTokens, rewardTrackersForDepositBalances],
  });

  // console.log("depositBalances", depositBalances);

  const stakingInfo = await getContractCall({
    provider: provider,
    contractInfo: RewardReader,
    arg0: rewardReaderAddress,
    method: "getStakingInfo",
    params: PLACEHOLDER_ACCOUNT,
    additionalArgs: [rewardTrackersForStakingInfo],
  });

  // console.log("stakingInfo", stakingInfo);

  const stakedGmxSupply = await getContractCall({
    provider: provider,
    contractInfo: Token,
    arg0: gmxAddress,
    method: "balanceOf",
    params: stakedGmxTrackerAddress,
  });

  // console.log("stakedGmxSupply", stakedGmxSupply);

  const aums = await getContractCall({
    provider: provider,
    contractInfo: GlpManager,
    arg0: glpManagerAddress,
    method: "getAums",
    params: null,
  });

  // console.log("aums", aums);

  const nativeTokenPrice = await getContractCall({
    provider: provider,
    contractInfo: Vault,
    arg0: vaultAddress,
    method: "getMinPrice",
    params: nativeTokenAddress,
  });

  // console.log("nativeTokenPrice", nativeTokenPrice);

  const vestingInfo = await getContractCall({
    provider: provider,
    contractInfo: ReaderV2,
    arg0: readerAddress,
    method: "getVestingInfo",
    params: PLACEHOLDER_ACCOUNT,
    additionalArgs: [vesterAddresses],
  });

  // console.log("vestingInfo", vestingInfo);

  const uniPoolSlot0 = await getContractCall({
    provider: provider,
    contractInfo: UniPool,
    arg0: poolAddress,
    method: "slot0",
    params: null,
  });

  // console.log("uniPoolSlot0", uniPoolSlot0);

  const ethPrice = await getContractCall({
    provider: provider,
    contractInfo: Vault,
    arg0: vaultAddress,
    method: "getMinPrice",
    params: ethAddress,
  });

  // console.log("ethPrice", ethPrice);

  const tokenA = new UniToken(chainId, ethAddress, 18, "SYMBOL", "NAME");
  const tokenB = new UniToken(chainId, gmxAddress, 18, "SYMBOL", "NAME");

  const pool = new Pool(
    tokenA, // tokenA
    tokenB, // tokenB
    10000, // fee
    uniPoolSlot0.sqrtPriceX96, // sqrtRatioX96
    1, // liquidity
    uniPoolSlot0.tick, // tickCurrent
    []
  );

  const poolTokenPrice = pool.priceOf(tokenB).toSignificant(6);
  const poolTokenPriceAmount = parseValue(poolTokenPrice, 18)!;

  const gmxPrice = poolTokenPriceAmount
    .mul(ethPrice)
    .div(expandDecimals(1, 18));

  // console.log("gmxPrice", gmxPrice);

  const gmxSupply = await (
    await fetch(getServerUrl(chainId, "/gmx_supply"))
  ).text();
  // console.log("gmxSupply", gmxSupply);

  let aum;
  if (aums && aums.length > 0) {
    aum = aums[0].add(aums[1]).div(2);
  }

  const { balanceData, supplyData } = getBalanceAndSupplyData(walletBalances);
  const depositBalanceData = getDepositBalanceData(depositBalances);
  const stakingData = getStakingData(stakingInfo);
  const vestingData = getVestingData(vestingInfo);

  const processedData = getProcessedData(
    balanceData,
    supplyData,
    depositBalanceData,
    stakingData,
    vestingData,
    aum,
    nativeTokenPrice,
    stakedGmxSupply,
    gmxPrice,
    gmxSupply
  );

  // console.log("processedData", processedData);

  const formatted = formatKeyAmount(processedData, LABEL, 2, 2, true);
  // console.log("formatted", formatted);

  return formatted;
};

export const getGmxData = async () => {
  const data = await main(ethers.constants.AddressZero);

  const stakedGlpApr =
    100 * ((1 + data.glpAprForNativeToken / (100 * 365)) ** 365 - 1);
  // console.log("stakedGlpApr", stakedGlpApr);
  const esGmxApr =
    100 * ((1 + data.gmxAprForNativeToken / (100 * 365)) ** 365 - 1);
  // console.log("esGmxApr", esGmxApr);
  return {
    stakedGlpApr,
    esGmxApr,
  };
};

// printData().catch((error) => console.error(error));
