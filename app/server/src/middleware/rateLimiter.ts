/**
 * In-memory rate limiter для auth эндпоинтов
 * Защита от брутфорс-атак на логин
 */
import type { Request, Response, NextFunction } from 'express'

import { clientIp } from '../lib/client-ip.js'
import { ERROR_MESSAGES } from '../lib/constants.js'
import { ApiError } from '../lib/errors.js'
import { nameMiddleware } from '../lib/middleware-name.js'

interface RateLimitEntry {
	count: number
	resetAt: number
}

// In-memory fallback store
const store = new Map<string, RateLimitEntry>()

// Интервал очистки - удаляем истёкшие записи каждые 5 минут
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

setInterval(() => {
	const now = Date.now()
	for (const [key, entry] of store.entries()) {
		if (entry.resetAt <= now) {
			store.delete(key)
		}
	}
}, CLEANUP_INTERVAL_MS)

// No external store — in-memory Map is used (sufficient for single-instance personal deployment)

export interface RateLimiterOptions {
	/**
	 * Максимальное количество запросов в окне
	 * @default 5
	 */
	maxAttempts?: number

	/**
	 * Временное окно в миллисекундах
	 * @default 60000 (1 минута)
	 */
	windowMs?: number

	/**
	 * Опциональный префикс ключа для namespace
	 */
	keyPrefix?: string

	clientKey?: (req: Request) => string | undefined
}

/**
 * Создаёт middleware для ограничения частоты запросов
 *
 * @example
 * router.post('/login', rateLimiter({ maxAttempts: 5, windowMs: 60000 }), handler)
 */
export function rateLimiter(options: RateLimiterOptions = {}) {
	const { maxAttempts = 5, windowMs = 60 * 1000, keyPrefix = '', clientKey } = options

	const limiter = (req: Request, res: Response, next: NextFunction) => {
		const client = clientKey?.(req) || clientIp(req) || 'unknown'
		const key = keyPrefix ? `${keyPrefix}:${client}` : client
		const now = Date.now()
		// Memory-only implementation (suitable for single-instance personal deployment)
		const entry = store.get(key)

		if (!entry || entry.resetAt <= now) {
			// Первый запрос или окно истекло - создаём новую запись
			store.set(key, { count: 1, resetAt: now + windowMs })
			res.setHeader('X-RateLimit-Limit', String(maxAttempts))
			res.setHeader('X-RateLimit-Remaining', String(maxAttempts - 1))
			res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)))
			return next()
		}

		if (entry.count >= maxAttempts) {
			// Лимит превышен
			const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000)
			res.setHeader('Retry-After', String(retryAfterSec))
			res.setHeader('X-RateLimit-Limit', String(maxAttempts))
			res.setHeader('X-RateLimit-Remaining', '0')
			res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

			throw ApiError.tooManyRequests(ERROR_MESSAGES.TOO_MANY_REQUESTS)
		}

		// Увеличиваем счётчик
		entry.count++
		res.setHeader('X-RateLimit-Limit', String(maxAttempts))
		res.setHeader('X-RateLimit-Remaining', String(maxAttempts - entry.count))
		res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

		next()
	}
	return nameMiddleware(limiter, `rateLimiter(${keyPrefix || '-'},${maxAttempts}/${windowMs}ms)`)
}
