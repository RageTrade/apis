import { clearKeysContaining } from './clear-keys-containing'

export async function clearBlockNumberData(blockNumber: number) {
  await clearKeysContaining((key) => key.includes(`-${blockNumber}-`), false)
}
