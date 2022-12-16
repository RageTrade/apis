import { getTraderPnl } from "./trader-pnl";
import { getSupplyApy } from "./supply-rate";
import { getBorrowApy } from "./borrow-rate";
import { getEthRewards } from "./eth-rewards";

import { NetworkName } from "@ragetrade/sdk";
import { getEsgmxRewards } from "./esGmx-rewards";

export const getDnGmxApyBreakdown = async (networkName: NetworkName) => {
  const [traderPnl, supplyApy, borrowApy, ethRewards, esGmxRewards] =
    await Promise.all([
      getTraderPnl(),
      getSupplyApy(networkName),
      getBorrowApy(networkName),
      getEthRewards(networkName),
      getEsgmxRewards(networkName),
    ]);

  const seniorVault = {
    aaveSupplyApy: supplyApy,
    glpRewardsPct: 6.29,
    _glpRewardsPct: ethRewards[1],
  };

  const juniorVault = {
    btcBorrowApy: borrowApy[0],
    ethBorrowApy: borrowApy[1],
    glpTraderPnl: traderPnl,
    glpRewardsPct: 14.71, // ethRewards[0],
    _glpRewardsPct: ethRewards[0],
    esGmxRewards,
  };

  return { seniorVault, juniorVault };
};
