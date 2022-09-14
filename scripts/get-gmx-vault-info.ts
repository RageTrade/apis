import { NetworkName, getGmxVaultContracts } from "@ragetrade/sdk";
import { getProvider } from "../providers";

export async function getGmxVaultInfo(networkName: NetworkName) {
  const provider = getProvider(networkName);
  const { glpManager, glp } = await getGmxVaultContracts(provider);
  const aumInUsdg = await glpManager.getAumInUsdg(true);
  const glpSupply = await glp.totalSupply();
  return {
    aumInUsdg: aumInUsdg.toString(),
    glpSupply: glpSupply.toString(),
  };
}
