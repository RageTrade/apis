import type { NetworkName } from '@ragetrade/sdk'

import { getBorrowApy } from './borrow-rate'
import { getEsgmxRewards } from './esGmx-rewards'
import { getEthRewards } from './eth-rewards'
import { getSupplyApy } from './supply-rate'
import { getTraderPnl } from './trader-pnl'

export const getDnGmxApyBreakdown = async (networkName: NetworkName) => {
  const [traderPnl, supplyApy, borrowApy, ethRewards, esGmxRewards] = await Promise.all([
    getTraderPnl(),
    getSupplyApy(networkName),
    getBorrowApy(networkName),
    getEthRewards(networkName),
    getEsgmxRewards(networkName)
  ])

  const seniorVault = {
    aaveSupplyApy: supplyApy,
    glpRewardsPct: ethRewards[1]
  }

  const juniorVault = {
    btcBorrowApy: borrowApy[0],
    ethBorrowApy: borrowApy[1],
    glpTraderPnl: traderPnl,
    glpRewardsPct: ethRewards[0],
    esGmxRewards
  }

  return { seniorVault, juniorVault }
}
