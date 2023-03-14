import { clearKeysContaining } from './clear-keys-containing'

export async function clearIndexerData() {
  await clearKeysContaining((key) => key.includes('send-error'), false)
}
