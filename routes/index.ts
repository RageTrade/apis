import express from 'express'

import dataRouter from './data'
import logsRouter from './logs'

export const router = express.Router()

router.get('/', function (req, res, next) {
  res.json({ hello: 'world' })
})

router.use('/logs', logsRouter)
router.use('/data', dataRouter)
