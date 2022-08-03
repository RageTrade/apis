import { ethers } from "ethers";
import { config } from "dotenv";
config();

export const arbmain = new ethers.providers.StaticJsonRpcProvider(
  "https://arb-mainnet.g.alchemy.com/v2/" + process.env.ALCHEMY_KEY
);
export const arbtest = new ethers.providers.StaticJsonRpcProvider(
  "https://arb-rinkeby.g.alchemy.com/v2/" + process.env.ALCHEMY_KEY
);
