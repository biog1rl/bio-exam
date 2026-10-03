import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
/**
 * Помощники для тестов с базой данных (D-02, D-03, VER-01).
 *
 * - Адрес сервера берётся только из TEST_DATABASE_URL и проходит защиту (localhost/127.0.0.1,
 *   база test_*). Без него тест падает с подсказкой, а не пропускается.
 * - Каждый тестовый файл создаёт свою временную базу <prefix>_<pid>_<hex> и удаляет её в afterAll,
 *   поэтому параллельные воркеры Vitest и задачи Turbo никогда не делят одну базу.
 * - Миграции применяются тем же мигратором drizzle, что и в apply-migration.ts.
 *
 * URL никогда не печатается.
 */
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Client, Pool } from 'pg'

import { assertTestDatabaseUrl, withDatabaseName } from '../config/test-database-url.js'

const TEST_NAME = /^test_[a-z0-9_]+$/

/** Абсолютный путь к app/server/drizzle (не зависит от cwd: Turbo и Vitest запускают из разных мест) */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

export type ScratchDatabase = {
	/** URL временной базы (уже прошёл защиту) */
	url: string
	/** Имя временной базы */
	name: string
	/** Удаляет базу с FORCE; повторный вызов возвращает тот же промис */
	drop: () => Promise<void>
}

/**
 * TEST_DATABASE_URL после защиты. Без переменной тест падает (D-03: никаких пропусков).
 */
export function requireTestDatabaseUrl(): string {
	const raw = process.env.TEST_DATABASE_URL
	if (raw === undefined || raw.trim() === '') {
		throw new Error(
			'DB-backed test needs TEST_DATABASE_URL: run it through node scripts/with-test-db.mjs -- <command> or yarn verify'
		)
	}
	return assertTestDatabaseUrl(raw)
}

/** Подключение к защищённой базе на время fn */
async function withClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
	const client = new Client({ connectionString: assertTestDatabaseUrl(url) })
	await client.connect()
	try {
		return await fn(client)
	} finally {
		await client.end()
	}
}

/**
 * Создаёт временную базу <prefix>_<pid>_<hex> на сервере из TEST_DATABASE_URL.
 * Контракт тот же, что у scripts/lib/test-db.mjs: префикс ^test_[a-z0-9_]+$, drop() с FORCE.
 */
export async function createScratchDatabase(prefix: string): Promise<ScratchDatabase> {
	if (!TEST_NAME.test(prefix)) {
		throw new Error(`scratch database prefix ${prefix} must match ^test_[a-z0-9_]+$`)
	}
	const adminUrl = requireTestDatabaseUrl()
	const name = `${prefix}_${process.pid}_${crypto.randomBytes(3).toString('hex')}`.toLowerCase()
	const url = withDatabaseName(adminUrl, name)
	await withClient(adminUrl, (client) => client.query(`CREATE DATABASE "${name}"`))

	let dropPromise: Promise<void> | null = null
	const drop = () => {
		dropPromise ??= withClient(adminUrl, async (client) => {
			await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
		})
		return dropPromise
	}
	return { url, name, drop }
}

/**
 * Применяет миграции app/server/drizzle к временной базе тем же мигратором, что и
 * apply-migration.ts (таблица учёта в public, как в живой базе).
 */
export async function migrateTestDatabase(url: string): Promise<void> {
	const pool = new Pool({ connectionString: assertTestDatabaseUrl(url) })
	try {
		await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: 'public' })
	} finally {
		await pool.end()
	}
}
