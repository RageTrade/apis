import redis from 'ioredis'

let _redisClient: any

export function getRedisClient() {
  if (_redisClient) {
    return _redisClient
  }
  return (_redisClient = redis.createClient())
}
