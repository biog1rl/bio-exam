/**
 * Конфигурация аутентификации
 * Централизованные настройки авторизации для избежания дублирования
 */
import { DEFAULTS } from '../lib/constants.js'

const jwtSecret = process.env.AUTH_JWT_SECRET || DEFAULTS.JWT_SECRET

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
	sessionMaxAgeDays: Number(process.env.SESSION_MAX_AGE_DAYS ?? DEFAULTS.SESSION_MAX_AGE_DAYS),

	/**
	 * Время жизни сессии в секундах (вычисляемое)
	 */
	get sessionMaxAgeSec(): number {
		return this.sessionMaxAgeDays * 24 * 60 * 60
	},
} as const
