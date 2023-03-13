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

  const { ethUsdAggregator } = await chainlink.getContracts(provider)

  const usdcUsdAggregator = ethUsdAggregator.attach(
    '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3'
  )

  const usdcPrice = await usdcUsdAggregator
    .latestRoundData()
    .then(({ answer }) => Number(formatUnits(answer, 8)))

  return {
    usdcPrice
  }
}
