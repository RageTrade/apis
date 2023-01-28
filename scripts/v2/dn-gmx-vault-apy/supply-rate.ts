import 'isomorphic-unfetch'

import type { NetworkName } from '@ragetrade/sdk'
import { deltaNeutralGmxVaults } from '@ragetrade/sdk'

import { getProvider } from '../../../providers'
import { fetchRetry } from '../../../utils'

const dataUrl =
  'https://yields.llama.fi/poolsEnriched?pool=7aab7b0f-01c1-4467-bc0d-77826d870f19'

export const getSupplyApy = async (networkName: NetworkName) => {
  const provider = getProvider(networkName)

  const dn = await deltaNeutralGmxVaults.getContracts(provider)

  const [_seniorTvl, _dnUsdcDeposited, response] = await Promise.all([
    dn.dnGmxSeniorVault.getVaultMarketValue(),
    dn.dnGmxJuniorVault.dnUsdcDeposited(),
    fetchRetry(dataUrl)
  ])

  const seniorTvl = _seniorTvl.toNumber()
  const dnUsdcDeposited = _dnUsdcDeposited.toNumber()

  const baseApy = (await response.json()).data[0].apy

  const amplification = seniorTvl > 0 ? (seniorTvl + dnUsdcDeposited) / seniorTvl : 0

  return baseApy * amplification
}
