import crypto from 'node:crypto'
import pino from 'pino'
import pinoHttp from 'pino-http'

const level = process.env.LOG_LEVEL ?? 'info'

export const logger = pino({ level })

export const pinoHttpMiddleware = pinoHttp({
	logger,
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

export default logger
