import { BigNumber } from "ethers";
import { getProvider } from "../../providers";
import { gmxProtocol, NetworkName, tokens, typechain } from "@ragetrade/sdk";

export const getGlpMintBurnConversion = async (
  networkName: NetworkName,
  dollarValueD18: BigNumber,
  isUsdcToGlp: Boolean
) => {
  const provMain = getProvider(networkName);

  const tk = await tokens.getContracts(provMain);
  const gmx = await gmxProtocol.getContracts(provMain);

  const usdg = typechain.IERC20Metadata__factory.connect(
    "0x45096e7aA921f27590f8F19e457794EB09678141",
    provMain
  );

  const TAX_BASIS_POINTS = 50;
  const MINT_BURN_FEE_BASIS_POINTS = 25;

  let feeBasisPoints = BigNumber.from(MINT_BURN_FEE_BASIS_POINTS);
  const taxBasisPoints = BigNumber.from(TAX_BASIS_POINTS);

  const totalWeights = await gmx.gmxUnderlyingVault.totalTokenWeights();
  const usdcWeight = await gmx.gmxUnderlyingVault.tokenWeights(tk.usdc.address);

  const usdgSupply = await usdg.totalSupply();

  const initialAmount = await gmx.gmxUnderlyingVault.usdgAmounts(
    tk.usdc.address
  );

  let nextAmount = initialAmount.add(dollarValueD18);

  if (!isUsdcToGlp) {
    nextAmount = dollarValueD18.gt(initialAmount)
      ? BigNumber.from(0)
      : initialAmount.sub(dollarValueD18);
  }

  const targetAmount = usdgSupply.mul(usdcWeight).div(totalWeights);

  if (!targetAmount || targetAmount.eq(0)) {
    return feeBasisPoints.toNumber();
  }

  const initialDiff = initialAmount.gt(targetAmount)
    ? initialAmount.sub(targetAmount)
    : targetAmount.sub(initialAmount);

  const nextDiff = nextAmount.gt(targetAmount)
    ? nextAmount.sub(targetAmount)
    : targetAmount.sub(nextAmount);

  if (nextDiff.lt(initialDiff)) {
    const rebateBps = taxBasisPoints.mul(initialDiff).div(targetAmount);

    return rebateBps.gt(feeBasisPoints)
      ? 0
      : feeBasisPoints.sub(rebateBps).toNumber();
  }

  let averageDiff = initialDiff.add(nextDiff).div(2);

  if (averageDiff.gt(targetAmount)) {
    averageDiff = targetAmount;
  }

  const taxBps = taxBasisPoints.mul(averageDiff).div(targetAmount);

  return feeBasisPoints.add(taxBps).toNumber();
};
