import { clearKeysContaining } from './clear-keys-containing'

export async function clearIndexerData() {
  await clearKeysContaining((key) => key.startsWith('account-created-indexer'), false)
}
