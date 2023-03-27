import { getRedisClient } from '../../redis-utils/get-client'

const redis = getRedisClient()

export async function progress(label: string) {
  const progressKey = `parallelize-progress-${label}`
  const data = JSON.parse((await redis.get(progressKey)) ?? '{}')

  return { data }
}
