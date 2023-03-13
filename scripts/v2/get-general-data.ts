import { chainlink, getProvider, NetworkName } from '@ragetrade/sdk'
import { ethers } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'

export interface GeneralDataResult {
  usdcPrice: number
}

export async function getGeneralData(
  networkName: NetworkName
): Promise<GeneralDataResult> {
  const provider = getProvider(networkName)

  const { usdcUsdAggregator } = await chainlink.getContracts(provider)

  const usdcPrice = await usdcUsdAggregator
    .latestRoundData()
    .then(({ answer }) => Number(formatUnits(answer, 8)))

  return {
    usdcPrice
  }
}
