import { listKeysContaining } from './list-keys-containing'

export async function listBlockNumberData(blockNumber: number) {
  await listKeysContaining((key) => key.includes(`-${blockNumber}-`), false)
}
