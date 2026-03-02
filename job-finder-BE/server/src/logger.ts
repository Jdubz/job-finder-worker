import pino from 'pino'
import pinoHttp from 'pino-http'

const isDev = process.env.NODE_ENV !== 'production'
const wantPretty = isDev && process.env.LOG_PRETTY !== 'false'

let transport: pino.TransportSingleOptions | undefined
if (wantPretty) {
  try {
    // Only enable pretty transport when dependency is available
    require.resolve('pino-pretty')
    transport = {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  } catch {
    // Fall back to JSON logging if pino-pretty isn't installed (e.g., slim images)
    transport = undefined
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport
})

export const httpLogger = pinoHttp({
  logger,
  autoLogging: true,
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error'
    if (res.statusCode === 404) return 'info'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  }
})
