import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults, gmxProtocol } from '@ragetrade/sdk'
import { ethers } from 'ethers'
import { formatEther } from 'ethers/lib/utils'

import { getProviderAggregate } from '../../providers'
import { getLogs } from '../../utils'
import { parallelize } from '../aggregated/util/parallelize'

perInterval('arbmain').then((v) => console.log(JSON.stringify(v)))

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

  // LINK / USD: https://arbiscan.io/address/0x86E53CF1B870786351Da77A57575e79CB55812CB
  // UNI / USD: https://arbiscan.io/address/0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720

  const startBlock = 44570369
  const endBlock = await provider.getBlockNumber()

  // const startBlock = 52181070;
  // const endBlock = 52419731; // await provider.getBlockNumber();
  // const interval = 497; // Math.floor(((endBlock - startBlock) * 3 * mins) / days);

  const feeGlpTracker = new ethers.Contract(
    '0x4e971a87900b931ff39d1aad67697f49835400b6',
    ['event Claim(address receiver, uint256 amount)'],
    provider
  )
  const stakedGlpTracker = feeGlpTracker.attach(
    '0x1addd80e6039594ee970e5872d247bf0414c8903'
  )
  const stakedGmxTracker = feeGlpTracker.attach(
    '0x908c4d94d34924765f1edc22a1dd098397c59dd4'
  )
  const bonusGmxTracker = feeGlpTracker.attach(
    '0x4d268a7d4c16ceb5a606c173bd974984343fea13'
  )
  const feeGmxTracker = feeGlpTracker.attach(
    '0xd2d1162512f927a7e282ef43a362659e4f2a728f '
  )

  function _getLogsInLoop(contract: ethers.Contract) {
    return async () => {
      const logs = await getLogs(
        contract.filters.Claim(null, null),
        startBlock,
        endBlock,
        contract
      )
      return logs.filter(
        (log) =>
          log.args?.receiver?.toLowerCase() === dnGmxJuniorVault.address.toLowerCase()
      )
    }
  }

  const data = await parallelize(
    {
      networkName,
      provider,
      getEvents: [
        _getLogsInLoop(feeGlpTracker),
        _getLogsInLoop(stakedGlpTracker),
        _getLogsInLoop(stakedGmxTracker),
        _getLogsInLoop(bonusGmxTracker),
        _getLogsInLoop(feeGmxTracker)
      ],
      ignoreMoreEventsInSameBlock: false
    },
    async (_i, blockNumber, event) => {
      return {
        blockNumber,
        contractAddress: event.address,
        amount: formatEther(event.args?.amount)
      }
    }
  )

  return data
}
