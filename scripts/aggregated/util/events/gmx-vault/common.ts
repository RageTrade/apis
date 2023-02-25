import type { NetworkName } from '@ragetrade/sdk'
import type { ethers } from 'ethers'

import { ENV } from '../../../../../env'

export const GET_LOGS_INTERVAL = 2000

export const getStartBlock = (networkName: NetworkName) => {
  switch (networkName) {
    case 'arbmain':
    case 'mainnetfork':
      return ENV.START_BLOCK_NUMBER
    case 'arbgoerli':
      return 2333454
    default:
      throw new Error(`Start block not available for the network: ${networkName}`)
  }
}
export const oneInFiftyBlocks = (e: ethers.Event) => [0].includes(e.blockNumber % 50)
