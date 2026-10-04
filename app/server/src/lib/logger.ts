import crypto from 'node:crypto'
import pino, { type DestinationStream, type Logger } from 'pino'
import pinoHttp from 'pino-http'

const level = process.env.LOG_LEVEL ?? 'info'

export const LOG_REDACT_PATHS = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]']

export function createLogger(destination?: DestinationStream): Logger {
	const options = { level, redact: { paths: LOG_REDACT_PATHS, censor: '[redacted]' } }
	return destination ? pino(options, destination) : pino(options)
}

export function createHttpLogger(base: Logger) {
	return pinoHttp({
		logger: base,
		autoLogging: false,
		genReqId: (req) => {
			// prefer existing id (set by requestId middleware) or header, otherwise generate
			// @ts-ignore
			const existing = (req as any).id || req.headers['x-request-id']
			if (existing) return String(existing)
			return crypto.randomUUID()
		},
		customLogLevel: (_req, res, err) => {
			if (res.statusCode >= 500 || err) return 'error'
			if (res.statusCode >= 400) return 'warn'
			return 'info'
		},
	})
}

export const logger = createLogger()

export const pinoHttpMiddleware = createHttpLogger(logger)

export default logger
