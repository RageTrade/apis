import { config } from 'dotenv'
import { z } from 'zod'

config()

const schema = z.object({
  ALCHEMY_KEY: z.string(),
  ALCHEMY_KEY_AGGREGATE: z.string(),
  ARBISCAN_KEY: z.string(),
  MAX_INFLIGHT_LOOPS: z.coerce.number(),
  PORT: z.coerce.number().optional(),
  ACTIVATE_STATS_PAGE: z.coerce.boolean().optional().default(true)
})

export const ENV = schema.parse(process.env)
