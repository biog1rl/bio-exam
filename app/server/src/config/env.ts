/**
 * Унифицированная загрузка .env для монорепы.
 * Приоритет: app/server/.env  → cwd/.env → app/.env → repo/.env
 * Последний загрузившийся файл МОЖЕТ переопределять предыдущие (override: true).
 * Можно включить отладочный вывод: DEBUG_ENV=1
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as dotenv } from 'dotenv'

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

export const ENV_LOADED_FROM = loadedFrom
