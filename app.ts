import cookieParser from 'cookie-parser'
import cors from 'cors'
import type { ErrorRequestHandler } from 'express'
import express from 'express'
import createError from 'http-errors'
import logger from 'morgan'

import { Analytics } from './analytics'
import { router } from './routes'

export const app = express()

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(cors())

const analytics = new Analytics()
setInterval(() => {
  analytics.storeTemp()
}, 10 * 1000)

app.use(function (_req, _res, next) {
  analytics.recordUrlVisit(_req.url)
  next()
})

app.use('/', router)

// catch 404 and forward to error handler
app.use(function (_req, _res, next) {
  next(createError(404))
})
const errorHandler: ErrorRequestHandler = function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  const status = err.status || 500
  res.status(status)
  res.json({ error: err.message, status })
  next()
}
app.use(errorHandler)
