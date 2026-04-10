import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'

import '../config/env.js'
import { ENV_LOADED_FROM, safeDsn } from '../config/env.js'
import * as schema from './schema.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
	throw new Error('DATABASE_URL is not set')
}

const isDev = process.env.NODE_ENV !== 'production'

function shouldEnableSsl(connectionString: string): boolean {
	if (process.env.PG_FORCE_SSL === '1') return true

	try {
		const u = new URL(connectionString)
		const hasSslParam = u.searchParams.has('sslmode') || u.searchParams.has('ssl')
		if (hasSslParam) return false
		return u.hostname.endsWith('.supabase.com')
	} catch {
		return false
	}
}

// Небольшой лог при старте (без пароля)
if (process.env.DEBUG_ENV === '1') {
	// eslint-disable-next-line no-console
	console.log(`[db] using DSN=${safeDsn(databaseUrl)} (env from: ${ENV_LOADED_FROM ?? 'none'})`)
}

/** Общий пул подключений (экспортируем для health/raw) */
const poolConfig: PoolConfig = {
	connectionString: databaseUrl,
	max: Number(process.env.PG_POOL_MAX ?? (isDev ? 2 : 20)),
	maxUses: Number(process.env.PG_MAX_USES ?? 200),
	idleTimeoutMillis: 30000, // закрывать неактивные соединения через 30 сек
	connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 5000),
	query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS ?? 10000),
	statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 10000),
	keepAlive: true,
	keepAliveInitialDelayMillis: Number(process.env.PG_KEEPALIVE_DELAY_MS ?? 10000),
}

if (shouldEnableSsl(databaseUrl)) {
	poolConfig.ssl = { rejectUnauthorized: false }
}

if (process.env.DEBUG_ENV === '1') {
	// eslint-disable-next-line no-console
	console.log(`[db] ssl enabled: ${poolConfig.ssl ? 'yes' : 'no'}`)
}

export const pgPool = new Pool(poolConfig)

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
