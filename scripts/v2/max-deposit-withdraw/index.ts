import { parseUsdc } from "@ragetrade/sdk";
import { getDnGmxMaxDepositWithdrawBtc } from "./btc";
import { getDnGmxMaxDepositWithdrawEth } from "./eth";

async function main() {
  const [btc, eth] = await Promise.all([
    getDnGmxMaxDepositWithdrawBtc("arbmain"),
    getDnGmxMaxDepositWithdrawEth("arbmain"),
  ]);

  const result = {
    maxDepositInUsd: parseUsdc(btc.maxDepositInUsd).lt(
      parseUsdc(eth.maxDepositInUsd)
    )
      ? btc.maxDepositInUsd
      : eth.maxDepositInUsd,
    maxWithdrawInUsd: parseUsdc(btc.maxWithdrawInUsd).lt(
      parseUsdc(eth.maxWithdrawInUsd)
    )
      ? btc.maxWithdrawInUsd
      : eth.maxWithdrawInUsd,
  };

  console.log(result);
}

main().catch(console.error);
