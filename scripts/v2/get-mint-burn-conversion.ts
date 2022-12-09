import { getProvider } from "../../providers";
import {
  NetworkName,
  stringifyBigNumber,
  getGlpMintBurnConversionIntermediate as getGlpMintBurnConversionIntermediateSDK,
} from "@ragetrade/sdk";

export const getGlpMintBurnConversionIntermediate = async (
  networkName: NetworkName
) => {
  const provider = getProvider(networkName);

  const result = await getGlpMintBurnConversionIntermediateSDK(
    provider,
    networkName
  );

  return stringifyBigNumber(result);
};
