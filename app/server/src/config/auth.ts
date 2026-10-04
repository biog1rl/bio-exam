/**
 * Конфигурация аутентификации
 * Централизованные настройки авторизации для избежания дублирования
 */
import { DEFAULTS } from '../lib/constants.js'

const jwtSecret = process.env.AUTH_JWT_SECRET || DEFAULTS.JWT_SECRET

const ACCESS_TOKEN_TTL_DEFAULT_SEC = 900
const ACCESS_TOKEN_TTL_MIN_SEC = 60
const ACCESS_TOKEN_TTL_MAX_SEC = 3600

export function parseAccessTokenTtl(raw: string | undefined): number {
	if (raw === undefined) return ACCESS_TOKEN_TTL_DEFAULT_SEC
	const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
	if (!Number.isInteger(value) || value < ACCESS_TOKEN_TTL_MIN_SEC || value > ACCESS_TOKEN_TTL_MAX_SEC) {
		throw new Error(
			`ACCESS_TOKEN_EXPIRES_SEC must be an integer from ${ACCESS_TOKEN_TTL_MIN_SEC} to ${ACCESS_TOKEN_TTL_MAX_SEC} seconds`
		)
	}
	return value
}

const sessionMaxAgeDays = Number(process.env.SESSION_MAX_AGE_DAYS ?? DEFAULTS.SESSION_MAX_AGE_DAYS)

// Fail-fast in production if secret is missing or left as default
if (process.env.NODE_ENV === 'production') {
	if (!process.env.AUTH_JWT_SECRET || jwtSecret === DEFAULTS.JWT_SECRET) {
		throw new Error('AUTH_JWT_SECRET must be set to a non-default value in production')
	}
}

export const AUTH_CONFIG = {
	/**
	 * Секрет для подписи JWT токенов
	 */
	jwtSecret,

	/**
	 * Имя cookie для сессии
	 */
	sessionCookieName: process.env.SESSION_COOKIE_NAME || 'bio_exam_session',

	/**
	 * Время жизни сессии в днях
	 */
	sessionMaxAgeDays,

	accessTokenTtlSec: parseAccessTokenTtl(process.env.ACCESS_TOKEN_EXPIRES_SEC),

	refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? sessionMaxAgeDays),

	/**
	 * Время жизни сессии в секундах (вычисляемое)
	 */
	get sessionMaxAgeSec(): number {
		return this.sessionMaxAgeDays * 24 * 60 * 60
	},
} as const
