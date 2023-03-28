import { listKeysContaining } from './list-keys-containing'

export async function listBlockNumberData(blockNumber: number) {
  return await listKeysContaining((key) => key.includes(`-${blockNumber}-`), false)
}
