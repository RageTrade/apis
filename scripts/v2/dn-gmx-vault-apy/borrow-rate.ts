import "isomorphic-unfetch";
import { typechain } from "@ragetrade/sdk";
import { NetworkName } from "@ragetrade/sdk";
import { getProvider } from "../../../providers";
import { formatUnits } from "ethers/lib/utils";
import { deltaNeutralGmxVaults } from "@ragetrade/sdk";

const idWeth =
  "42161-0x82af49447d8a07e3bd95bd0d56f35241523fbab1-0xa97684ead0e402dc232d5a977953df7ecbab3cdb";
const idWbtc =
  "42161-0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f-0xa97684ead0e402dc232d5a977953df7ecbab3cdb";

const dataUrl = "https://aave-api-v2.aave.com/data/markets-data";

const getBtcPrice = async (networkName: NetworkName) => {
  const btcPrice =
    networkName == "arbmain"
      ? (
          await (
            await fetch(
              "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
            )
          ).json()
        ).bitcoin.usd
      : 15_000;

  return btcPrice;
};

const getETHPrice = async (networkName: NetworkName) => {
  const ethPrice =
    networkName == "arbmain"
      ? (
          await (
            await fetch(
              "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
            )
          ).json()
        ).ethereum.usd
      : 2_000;

  return ethPrice;
};

export const getBorrowApy = async (networkName: NetworkName) => {
  const provider = getProvider(networkName);

  const vdWbtc = typechain.core.ERC20__factory.connect(
    networkName == "arbmain"
      ? "0x92b42c66840C7AD907b4BF74879FF3eF7c529473"
      : "0x3bf376701600ACAF865EBdf902Ef3b322BB433aE",
    provider
  );
  const vdWeth = typechain.core.ERC20__factory.connect(
    networkName == "arbmain"
      ? "0x0c84331e39d6658Cd6e6b9ba04736cC4c4734351"
      : "0xf69Ff61eE59Cd1Fd191B094C957938C7Dd0F8c3c",
    provider
  );

  const [dn, btcPrice, ethPrice, aaveResponse] = await Promise.all([
    deltaNeutralGmxVaults.getContracts(provider),
    getBtcPrice(networkName),
    getETHPrice(networkName),
    fetch(dataUrl),
  ]);

  const [aaveResponseJson, _btcQuantity, _ethQuantity, _vmv] =
    await Promise.all([
      aaveResponse.json(),
      vdWbtc.balanceOf(dn.dnGmxJuniorVault.address),
      vdWeth.balanceOf(dn.dnGmxJuniorVault.address),
      dn.dnGmxJuniorVault.getVaultMarketValue(),
    ]);

  const aaveReserves = aaveResponseJson.reserves;

  const btcBorrowBase = Number(
    aaveReserves.find((o: any) => o.id === idWbtc).variableBorrowRate
  );
  const ethBorrowBase = Number(
    aaveReserves.find((o: any) => o.id === idWeth).variableBorrowRate
  );

  const btcQuantity = Number(formatUnits(_btcQuantity, 8));
  const ethQuantity = Number(formatUnits(_ethQuantity, 18));
  const vmv = Number(formatUnits(_vmv, 6));

  const btcBorrowApy =
    vmv > 0 ? (btcBorrowBase * btcPrice * btcQuantity) / vmv : 0;
  const ethBorrowApy =
    vmv > 0 ? (ethBorrowBase * ethPrice * ethQuantity) / vmv : 0;

  return [btcBorrowApy * -1 * 100, ethBorrowApy * -1 * 100];
};
