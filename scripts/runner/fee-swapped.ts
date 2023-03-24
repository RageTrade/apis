import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, formatUsdc, gmxProtocol } from '@ragetrade/sdk'
import { formatEther } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { glpSwapped } from '../aggregated/util/events/junior-vault'
import { parallelize } from '../aggregated/util/parallelize'

export async function perInterval(networkName: NetworkName) {
  const provider = getProviderAggregate(networkName)

  const { dnGmxJuniorVault } = deltaNeutralGmxVaults.getContractsSync(
    networkName,
    provider
  )
  const { gmxUnderlyingVault } = gmxProtocol.getContractsSync(networkName, provider)
  const allWhitelistedTokensLength = (
    await gmxUnderlyingVault.allWhitelistedTokensLength()
  ).toNumber()
  const allWhitelistedTokens: string[] = []
  for (let i = 0; i < allWhitelistedTokensLength; i++) {
    allWhitelistedTokens.push(await gmxUnderlyingVault.allWhitelistedTokens(i))
  }

  // const startBlock = 52181070;
  // const endBlock = 52419731; // await provider.getBlockNumber();
  // const interval = 497; // Math.floor(((endBlock - startBlock) * 3 * mins) / days);

  const data = await parallelize(
    {
      label: 'fee-swapped',
      networkName,
      provider,
      getEvents: [glpSwapped],
      ignoreMoreEventsInSameBlock: false
    },
    async (_i, blockNumber, event) => {
      const glpPrice = Number(
        formatEther(
          await dnGmxJuniorVault.getPrice(false, {
            blockTag: blockNumber
          })
        )
      )
      return {
        blockNumber,
        contractAddress: event.address,
        glpQuantity: formatEther(event.args?.glpQuantity),
        usdcQuantity: formatUsdc(event.args?.usdcQuantity),
        fromGlpToUsdc: event.args.fromGlpToUsdc,
        glpPrice
      }
    }
  )

  return data
}
