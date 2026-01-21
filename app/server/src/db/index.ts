import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import '../config/env.js'
import { ENV_LOADED_FROM, safeDsn } from '../config/env.js'
import * as schema from './schema.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
	throw new Error('DATABASE_URL is not set')
}

// Небольшой лог при старте (без пароля)
if (process.env.DEBUG_ENV === '1') {
	// eslint-disable-next-line no-console
	console.log(`[db] using DSN=${safeDsn(databaseUrl)} (env from: ${ENV_LOADED_FROM ?? 'none'})`)
}

/** Общий пул подключений (экспортируем для health/raw) */
export const pgPool = new Pool({
	connectionString: databaseUrl,
	max: 20, // максимум соединений в пуле
	idleTimeoutMillis: 30000, // закрывать неактивные соединения через 30 сек
	connectionTimeoutMillis: 10000, // таймаут на установку соединения
})

// Обработка ошибок пула
pgPool.on('error', (err) => {
	console.error('[pgPool] Unexpected error on idle client', err)
})

/** Типизированный DB-инстанс */
export type DB = NodePgDatabase<typeof schema>

/** Готовый db для обычных запросов */
export const db: DB = drizzle(pgPool, { schema })

/** Транзакции с опциональным user_id */
export async function withUserTx<T>(userId: string | null, fn: (dbi: DB) => Promise<T>): Promise<T> {
	const client = await pgPool.connect()
	try {
		await client.query('BEGIN')
		if (userId) {
			await client.query('SET LOCAL app.user_id = $1', [userId])
		}
		const dbi: DB = drizzle(client, { schema })
		const res = await fn(dbi)
		await client.query('COMMIT')
		return res
	} catch (e) {
		await client.query('ROLLBACK')
		throw e
	} finally {
		client.release()
	}
}
