import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg

async function main() {
	const connectionString = process.env.DATABASE_URL
	if (!connectionString) {
		throw new Error('DATABASE_URL is not set')
	}

	const pool = new Pool({ connectionString })
	const db = drizzle(pool)

	console.log('Creating migrations table if not exists...')
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS __drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash TEXT NOT NULL,
			created_at BIGINT NOT NULL
		)
	`)

	// Читаем все SQL файлы миграций
	const migrationsDir = join(process.cwd(), 'drizzle')
	const files = await readdir(migrationsDir)
	const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort()

	console.log(`Found ${sqlFiles.length} migration files`)

	for (const file of sqlFiles) {
		const migrationName = file.replace('.sql', '')

		// Проверяем, применена ли миграция
		const existing = await db.execute(sql`
			SELECT hash FROM __drizzle_migrations WHERE hash = ${migrationName}
		`)

		if (existing.rows && existing.rows.length > 0) {
			console.log(`✓ Migration ${migrationName} already applied, skipping`)
			continue
		}

		console.log(`→ Applying migration ${migrationName}...`)

		// Читаем и применяем миграцию
		const migrationSQL = await readFile(join(migrationsDir, file), 'utf-8')
		const statements = migrationSQL
			.split('--> statement-breakpoint')
			.map((s) => s.trim())
			.filter((s) => s.length > 0)

		try {
			let hasErrors = false
			for (const statement of statements) {
				try {
					await db.execute(sql.raw(statement))
				} catch (err: unknown) {
					// Игнорируем ошибки "already exists"
					const isAlreadyExists =
						err &&
						typeof err === 'object' &&
						'cause' in err &&
						err.cause &&
						typeof err.cause === 'object' &&
						'code' in err.cause &&
						(err.cause.code === '42710' || // duplicate_object (enum, type)
							err.cause.code === '42P07' || // duplicate_table
							err.cause.code === '42701') // duplicate_column

					if (isAlreadyExists) {
						console.log(`  ⚠ Statement already executed, skipping`)
					} else {
						console.error(`  ✗ Statement failed:`, err)
						hasErrors = true
					}
				}
			}

			if (hasErrors) {
				throw new Error('Migration had errors')
			}

			// Регистрируем миграцию
			await db.execute(sql`
				INSERT INTO __drizzle_migrations (hash, created_at)
				VALUES (${migrationName}, ${Date.now()})
			`)

			console.log(`✓ Migration ${migrationName} applied successfully`)
		} catch (err) {
			console.error(`✗ Migration ${migrationName} failed:`, err)
			throw err
		}
	}

	console.log('All migrations completed!')
	await pool.end()
}

main().catch((err) => {
	console.error('Migration failed:', err)
	process.exit(1)
})
