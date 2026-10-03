import { config as loadDotenv } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { join } from 'path'
import pg from 'pg'

import { isIsolatedEnv, resolveIsolatedDatabaseUrl } from '../config/test-database-url.js'

// В изолированном режиме (BIO_EXAM_ISOLATED_ENV=1) .env не загружаем: ни DATABASE_URL,
// ни SUPABASE_* не должны подтянуться из файла. Иначе — прежнее поведение dotenv/config.
if (!isIsolatedEnv()) {
	loadDotenv()
}

const { Pool } = pg

async function main() {
	// Изолированный режим: только TEST_DATABASE_URL через защиту, проверка до new Pool
	const connectionString = isIsolatedEnv() ? resolveIsolatedDatabaseUrl() : process.env.DATABASE_URL
	if (!connectionString) {
		throw new Error('DATABASE_URL is not set')
	}

	const pool = new Pool({ connectionString })
	const db = drizzle(pool)

	console.log('Running migrations...')

	await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle'), migrationsSchema: 'public' })

	console.log('All migrations completed!')
	await pool.end()
}

main().catch((err) => {
	console.error('Migration failed:', err)
	process.exit(1)
})
