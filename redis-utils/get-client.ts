import redis from 'ioredis'
import type { Redis } from 'ioredis'

let _redisClient: any

export function getRedisClient(): Redis {
  if (_redisClient) {
    return _redisClient
  }
  return (_redisClient = redis.createClient())
}
