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

import './config/env.js'
import { ApiError, isApiError } from './lib/errors.js'
import { pinoHttpMiddleware } from './lib/logger.js'
import { sessionOptional } from './middleware/auth/session.js'
import requestId from './middleware/requestId.js'
import healthRouter from './routes/db/health.js'
import apiRouter from './routes/index.js'

const app = express()
app.set('trust proxy', 1)
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT ?? '10mb'

// --- Безопасность/заголовки
app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
				connectSrc: ["'self'"],
				fontSrc: ["'self'"],
				objectSrc: ["'none'"],
				upgradeInsecureRequests: [],
			},
		},
		crossOriginResourcePolicy: { policy: 'cross-origin' },
	})
)

// --- Request id + логирование
app.use(requestId)
app.use(pinoHttpMiddleware)

// --- CORS
const allowlist = (process.env.ALLOWED_ORIGIN ?? '')
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean)

const isDev = process.env.NODE_ENV !== 'production'

app.use(
	cors({
		origin: (origin, cb) => {
			// Запросы без Origin (curl, server-to-server) — позволяем
			if (!origin) return cb(null, true)

			// В development: если allowlist пустой — разрешаем localhost и любые origin для удобства
			if (isDev) {
				if (allowlist.length === 0) return cb(null, true)
				if (allowlist.includes(origin)) return cb(null, true)
				if (origin.startsWith('http://localhost:')) return cb(null, true)
				return cb(new Error('Not allowed by CORS'))
			}

			// В production: требуем явного ALLOWED_ORIGIN; пустой allowlist — ошибка конфигурации
			if (!isDev) {
				if (allowlist.length === 0) return cb(new Error('CORS not configured: ALLOWED_ORIGIN is empty'))
				if (allowlist.includes(origin)) return cb(null, true)
				return cb(new Error('Not allowed by CORS'))
			}

			return cb(new Error('Not allowed by CORS'))
		},
		credentials: true,
	})
)

// --- Парсинг JSON тел
app.use(express.json({ limit: JSON_BODY_LIMIT }))

// --- Раздача статических файлов uploads
if (process.env.NODE_ENV !== 'production') {
	app.use('/uploads', express.static(path.join(process.cwd(), '../web/public/uploads')))
}

// --- Сессия из JWT (опционально, чтобы req.authUser был доступен в роутерах)
app.use(sessionOptional())

// --- Healthchecks
app.get('/healthz', (_req, res) => res.json({ ok: true }))
app.use('/healthz', healthRouter) // /healthz/db

// --- API
app.use('/api', apiRouter)

type ReqWithLog = Request & {
	log?: { error: (obj: unknown, msg?: string) => void }
	id?: string
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
	const reqWithLog = req as unknown as ReqWithLog
	const requestId = reqWithLog.id || crypto.randomUUID()

	// Логируем ошибку с контекстом
	try {
		reqWithLog.log?.error(
			{
				err,
				requestId,
				method: req.method,
				path: req.path,
				isOperational: isApiError(err) ? err.isOperational : false,
			},
			'Request error'
		)
	} catch {
		// Игнорируем ошибки логирования
	}

	// Определяем статус-код и сообщение
	let status: number
	let message: string

	if (isApiError(err)) {
		status = err.statusCode
		message = err.message
	} else if (typeof (err as { status?: unknown }).status === 'number') {
		status = (err as { status: number }).status
		message = err instanceof Error ? err.message : 'Internal Server Error'
	} else {
		status = 500
		message =
			process.env.NODE_ENV === 'production'
				? 'Internal Server Error'
				: err instanceof Error
					? err.message
					: 'Internal Server Error'
	}

	res.status(status).json({
		error: message,
		...(process.env.NODE_ENV !== 'production' && { requestId }),
	})
}
app.use(errorHandler)

export default app
