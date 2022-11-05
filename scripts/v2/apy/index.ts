import { getTraderPnl } from './trader-pnl'
import { getSupplyApy } from "./supply-rate";
import { getBorrowApy } from "./borrow-rate";
import { getEthRewards } from "./eth-rewards";

import { NetworkName } from '@ragetrade/sdk';

export const getApyBreakdown = async (networkName: NetworkName) => {
  const traderPnl = await getTraderPnl()

  const supplyApy = await getSupplyApy(networkName)
  const borrowApy = await getBorrowApy(networkName)

  const ethRewards = await getEthRewards(networkName)

  const seniorVault = {
    'aave_supply_apy': supplyApy,
    'glp_rewards_pct': ethRewards[1]
  }

  const juniorVault = {
    'btc_borrow_apy': borrowApy[0],
    'eth_borrow_apy': borrowApy[1],
    'glp_trader_pnl': traderPnl,
    'glp_rewards_pct': ethRewards[0]
  }

  return {seniorVault, juniorVault}
}