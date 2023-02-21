import type { NetworkName } from '@ragetrade/sdk'
import { chainIds } from '@ragetrade/sdk'
import type { ethers } from 'ethers'

import { ArchiveCacheProvider } from './archive-cache-provider'
import { ENV } from './env'
import { RetryProvider } from './retry-provider'

export const arbmain = new RetryProvider(
  // "https://arb1.arbitrum.io/rpc"
  'https://arb-mainnet.g.alchemy.com/v2/' + ENV.ALCHEMY_KEY
  // process.env.QUICKNODE_URL
  // "https://rpc.ankr.com/arbitrum"
)
export const arbtest = new RetryProvider(
  // "https://rinkeby.arbitrum.io/rpc"
  'https://arb-rinkeby.g.alchemy.com/v2/' + ENV.ALCHEMY_KEY
)
export const arbgoerli = new RetryProvider(
  'https://arb-goerli.g.alchemy.com/v2/' + ENV.ALCHEMY_KEY
)
export const mainnetfork = new RetryProvider('https://internal-rpc.rage.trade')
// sdk.getProvider("arbgoerli");

export function getProvider(networkName: NetworkName): ethers.providers.Provider {
  switch (networkName) {
    case 'arbmain':
      return arbmain
    case 'arbgoerli':
      return arbgoerli
    case 'mainnetfork':
      return mainnetfork
    default:
      throw new Error(`Provider not available for the network: ${networkName}`)
  }
}

// This is separate from the above function because the aggregate apis make a lot of requests
export function getProviderAggregate(networkName: NetworkName): ArchiveCacheProvider {
  switch (networkName) {
    case 'arbmain':
      return new ArchiveCacheProvider(
        'https://arb-mainnet.g.alchemy.com/v2/' + ENV.ALCHEMY_KEY_AGGREGATE,
        chainIds.arbmain
      )
    case 'mainnetfork':
      return new ArchiveCacheProvider(
        'https://internal-rpc.rage.trade',
        31337,
        56878000,
        getProviderAggregate('arbmain')
      )
    case 'arbgoerli':
      return new ArchiveCacheProvider(
        'https://arb-goerli.g.alchemy.com/v2/' + ENV.ALCHEMY_KEY_AGGREGATE,
        chainIds.arbgoerli
      )
    default:
      throw new Error(`Aggregate provider not available for the network: ${networkName}`)
  }
}
