import "isomorphic-unfetch";
import { NetworkName } from "@ragetrade/sdk";
import { getProvider } from "../../../providers";
import { deltaNeutralGmxVaults } from "@ragetrade/sdk";

const dataUrl =
  "https://yields.llama.fi/poolsEnriched?pool=7aab7b0f-01c1-4467-bc0d-77826d870f19";

export const getSupplyApy = async (networkName: NetworkName) => {
  const provider = getProvider(networkName);
  const dn = await deltaNeutralGmxVaults.getContracts(provider);

  const response = await (await fetch(dataUrl)).json();
  const baseApy = response.data[0].apy;

  const seniorTvl = (
    await dn.dnGmxSeniorVault.getVaultMarketValue()
  ).toNumber();
  const dnUsdcDeposited = (
    await dn.dnGmxJuniorVault.dnUsdcDeposited()
  ).toNumber();

  const amplification =
    seniorTvl > 0 ? (seniorTvl + dnUsdcDeposited) / seniorTvl : 0;

  return baseApy * amplification;
};
