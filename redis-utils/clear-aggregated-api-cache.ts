import { clearKeysContaining } from './clear-keys-containing'

export async function clearErrorsInArchiveCacheProvider() {
  await clearKeysContaining((key) => key.includes('aggregated'), false)
}
