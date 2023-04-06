import { config } from 'dotenv'
config()

import './fetch-polyfill'
import './cron-jobs'

import Debugger from 'debug'
import http from 'http'

import { app } from './app'
import { connectMongo } from './db'
import { ENV } from './env'

const debug = Debugger('apis:server')

const port = ENV.PORT || 3000

app.set('port', port)

const server = http.createServer(app)

connectMongo()
  .then(() => {
    server.listen(port)
    server.on('error', onError)
    server.on('listening', onListening)
  })
  .catch((e) => console.error('Failled to connect to mongo', e))

function onError(error: any) {
  if (error.syscall !== 'listen') {
    throw error
  }

  const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges')
      process.exit(1)
      break
    case 'EADDRINUSE':
      console.error(bind + ' is already in use')
      process.exit(1)
      break
    default:
      throw error
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  const addr = server.address()
  const bind =
    addr !== null
      ? typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port
      : 'address is null'
  debug('Listening on ' + bind)
  console.log('Listening on ' + bind)
}
