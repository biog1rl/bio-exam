import { config as dotenv } from 'dotenv'
/**
 * Унифицированная загрузка .env для монорепы.
 * Приоритет: app/server/.env  → cwd/.env → app/.env → repo/.env
 * Последний загрузившийся файл МОЖЕТ переопределять предыдущие (override: true).
 * Можно включить отладочный вывод: DEBUG_ENV=1
 *
 * Изолированный режим: BIO_EXAM_ISOLATED_ENV=1 (тесты, проверка миграций, e2e).
 * В нём ни один .env не загружается (ENV_LOADED_FROM = null), окружение берётся только
 * от вызывающего процесса, а адрес базы — только из TEST_DATABASE_URL
 * (см. ./test-database-url.ts). Иначе override: true молча переключил бы процесс
 * с одноразовой базы на боевую из app/server/.env.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEFAULTS } from '../lib/constants.js'
import { isIsolatedEnv } from './test-database-url.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Корень пакета сервера (…/app/server)
const serverRoot = path.resolve(__dirname, '../../')

// Кандидаты по приоритету
const candidates = [
	path.join(serverRoot, '.env'), // ✅ app/server/.env — самый приоритетный
	path.resolve(process.cwd(), '.env'), // .env из текущей папки запуска
	path.resolve(serverRoot, '../.env'), // app/.env
	path.resolve(serverRoot, '../../.env'), // корень репо .env
]

let loadedFrom: string | null = null
// В изолированном режиме .env не читаем вовсе: dotenv() не вызывается, loadedFrom остаётся null
if (!isIsolatedEnv()) {
	for (const p of candidates) {
		try {
			if (fs.existsSync(p)) {
				dotenv({ path: p, override: true }) // <- разрешаем переопределять
				loadedFrom = p
				break // берём ПЕРВЫЙ существующий по приоритету
			}
		} catch {
			/* ignore */
		}
	}
}

// Безопасное представление DSN (без пароля)
export function safeDsn(raw: string | undefined): string {
	try {
		if (!raw) return 'undefined'
		const u = new URL(raw)
		if (u.password) u.password = '***'
		return u.toString()
	} catch {
		return 'invalid'
	}
}

if (process.env.DEBUG_ENV === '1') {
	// Лог только при включённой отладке
	// Важно: пароль не печатаем
	// eslint-disable-next-line no-console
	console.log(`[env] loaded from: ${loadedFrom ?? 'none'}`)
	// eslint-disable-next-line no-console
	console.log(`[env] DATABASE_URL: ${safeDsn(process.env.DATABASE_URL)}`)
}

// Валидация обязательных переменных окружения в production
if (process.env.NODE_ENV === 'production') {
	const missing: string[] = []
	if (!process.env.DATABASE_URL) missing.push('DATABASE_URL')
	if (!process.env.AUTH_JWT_SECRET || process.env.AUTH_JWT_SECRET === DEFAULTS.JWT_SECRET)
		missing.push('AUTH_JWT_SECRET')

	if (missing.length > 0) {
		// eslint-disable-next-line no-console
		console.error('[env] Missing required env vars for production:', missing.join(', '))
		throw new Error(`Missing required env vars for production: ${missing.join(', ')}`)
	}
}

export const ENV_LOADED_FROM = loadedFrom
