/**
 * Express приложение без запуска сервера.
 * Используется как для локальной разработки (src/index.ts),
 * так и для Vercel Serverless Functions (api/index.ts).
 */
import path from 'node:path'

import cors from 'cors'
import express from 'express'
import type { ErrorRequestHandler, Request } from 'express'
import helmet from 'helmet'
import pino from 'pino'
import pinoHttp from 'pino-http'

import './config/env.js'
import { sessionOptional } from './middleware/auth/session.js'
import healthRouter from './routes/db/health.js'
import apiRouter from './routes/index.js'

const app = express()

// --- Безопасность/заголовки
app.use(
	helmet({
		contentSecurityPolicy: false,
		crossOriginResourcePolicy: { policy: 'cross-origin' },
	})
)

// --- Логирование
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
app.use(
	pinoHttp({
		logger,
		autoLogging: false,
		customLogLevel: (_req, res, err) => {
			if (res.statusCode >= 500 || err) return 'error'
			if (res.statusCode >= 400) return 'warn'
			return 'info'
		},
	})
)

// --- CORS
const allowlist = (process.env.ALLOWED_ORIGIN ?? '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean)

app.use(
	cors({
		origin: (origin, cb) => {
			// Разрешить все localhost origins в development
			if (!origin || allowlist.length === 0 || allowlist.includes(origin)) return cb(null, true)
			// Разрешить любой порт на localhost
			if (origin.startsWith('http://localhost:')) return cb(null, true)
			return cb(new Error('Not allowed by CORS'))
		},
		credentials: true,
	})
)

// --- Парсинг JSON тел
app.use(express.json({ limit: '2mb' }))

// --- Раздача статических файлов uploads
app.use('/uploads', express.static(path.join(process.cwd(), '../web/public/uploads')))

// --- Сессия из JWT (опционально, чтобы req.authUser был доступен в роутерах)
app.use(sessionOptional())

// --- Healthchecks
app.get('/healthz', (_req, res) => res.json({ ok: true }))
app.use('/healthz', healthRouter) // /healthz/db

// --- API
app.use('/api', apiRouter)

type ReqWithLog = Request & { log?: { error: (obj: unknown, msg?: string) => void } }
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
	try {
		;(req as unknown as ReqWithLog).log?.error({ err }, 'Unhandled error')
	} catch {
		/* ignore */
	}
	const status = typeof (err as { status?: unknown }).status === 'number' ? (err as { status?: number }).status! : 500
	const message = err instanceof Error ? err.message : 'Internal Server Error'
	res.status(status).json({ error: message })
}
app.use(errorHandler)

export default app
