import fetch from 'isomorphic-unfetch'

import { gmxProtocol, NetworkName, ONE } from "@ragetrade/sdk";
import { BigNumber, Contract } from "ethers";
import { getProvider } from "../../../providers";

import RewardTracker from './RewardTracker.json'

const provMain = getProvider('arbmain')
const provReq = getProvider('arbgoerli')

const addrStakedGlpTracker = '0x1aDDD80E6039594eE970E5872D247bf0414C8903'
const addrStakedGmxTracker = '0x908C4D94D34924765f1eDc22A1DD098397c59dD4'

const BASIS_POINTS_DIVISOR = BigNumber.from(10000);
const SECONDS_PER_YEAR = BigNumber.from(31536000);

const ONE_ETHER = BigNumber.from(10).pow(18)

export const getEsgmxRewards = async (networkName: NetworkName) => {
  const stakedGlpTracker = new Contract(addrStakedGlpTracker, RewardTracker.abi, provMain)
  const stakedGmxTracker = new Contract(addrStakedGmxTracker, RewardTracker.abi, provMain)

  const gmxContracts = await gmxProtocol.getContracts(provMain)

  const glpAum = await gmxContracts.glpManager.getAum(false)
  const glpSupply = await gmxContracts.glp.totalSupply()

  const glpPrice = glpAum.div(glpSupply)
  // console.log(glpPrice.toString())

  const glpSupplyUsd = glpAum
  // console.log('glpSupplyUsd', glpSupplyUsd.toString())

  let gmxPrice = (
    await (
      await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=gmx&vs_currencies=usd"
      )
    ).json()
  ).gmx.usd;

  gmxPrice = BigNumber.from((gmxPrice* BASIS_POINTS_DIVISOR.toNumber()).toFixed(0))
  // console.log("gmxPrice", gmxPrice.toString())

  const stakedGmxTrackerSupplyUsd = (await stakedGmxTracker.totalSupply()).mul(gmxPrice)
  // console.log('stakedGmxTrackerSupplyUsd', stakedGmxTrackerSupplyUsd.toString())

  const tokensPerIntervalGlp = await stakedGlpTracker.tokensPerInterval()
  const tokensPerIntervalGmx = await stakedGmxTracker.tokensPerInterval()
  // console.log('tokensPerIntervalGlp', tokensPerIntervalGlp)
  // console.log('tokensPerIntervalGmx', tokensPerIntervalGmx)

  const stakedGlpTrackerAnnualRewardsUsd = tokensPerIntervalGlp
    .mul(SECONDS_PER_YEAR).mul(gmxPrice)
    .div(ONE_ETHER)
    .div(BASIS_POINTS_DIVISOR)
  // console.log('stakedGlpTrackerAnnualRewardsUsd', stakedGlpTrackerAnnualRewardsUsd.toString())

  const stakedGlpTrackerApr = stakedGlpTrackerAnnualRewardsUsd
    .mul(BigNumber.from(10).pow(30))
    .mul(BASIS_POINTS_DIVISOR)
    .div(glpSupplyUsd);
  // console.log('stakedGlpTrackerApr', stakedGlpTrackerApr.toString())


  const stakedGmxTrackerAnnualRewardsUsd = tokensPerIntervalGmx
    .mul(SECONDS_PER_YEAR).mul(gmxPrice)
    .div(ONE_ETHER)
  // console.log('stakedGmxTrackerAnnualRewardsUsd', stakedGmxTrackerAnnualRewardsUsd.toString())

  const stakedGmxTrackerApr = stakedGmxTrackerAnnualRewardsUsd
  .mul(ONE_ETHER)
  .mul(BASIS_POINTS_DIVISOR)
  .div(stakedGmxTrackerSupplyUsd);
  // console.log('stakedGmxTrackerApr', stakedGmxTrackerApr.toString())

  return [stakedGlpTrackerApr.toNumber() / 100, stakedGmxTrackerApr.toNumber() / 100]

}
