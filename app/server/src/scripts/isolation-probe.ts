/**
 * Проба изоляции для самопроверки scripts/lib/test-db.mjs (D-29).
 *
 * Печатает одну JSON-строку: откуда загружено окружение, заданы ли SUPABASE_URL и
 * SUPABASE_SERVICE_KEY (только булевы значения, никогда сами значения) и к какой базе
 * подключился пул из db/index.ts. Модули импортируются динамически, чтобы ошибка защиты
 * адреса печаталась одной строкой сообщения, без URL.
 */
import { isIsolatedEnv } from '../config/test-database-url.js'

async function main(): Promise<void> {
	// Проба никогда не подключается к базе вне изолированного режима
	if (!isIsolatedEnv()) {
		throw new Error('isolation-probe runs only with BIO_EXAM_ISOLATED_ENV=1')
	}
	const { ENV_LOADED_FROM } = await import('../config/env.js')
	const { pgPool } = await import('../db/index.js')
	try {
		const { rows } = await pgPool.query<{ database: string }>('select current_database() as database')
		console.log(
			JSON.stringify({
				envLoadedFrom: ENV_LOADED_FROM,
				supabaseUrlSet: Boolean(process.env.SUPABASE_URL),
				supabaseKeySet: Boolean(process.env.SUPABASE_SERVICE_KEY),
				database: rows[0]?.database ?? null,
			})
		)
	} finally {
		await pgPool.end()
	}
}

main().then(
	() => process.exit(0),
	(error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error))
		process.exit(1)
	}
)
