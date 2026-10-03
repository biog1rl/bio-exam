import { ROLE_KEYS } from '@bio-exam/rbac'

import { config as loadDotenv } from 'dotenv'

import { isIsolatedEnv } from '../config/test-database-url.js'
import { db } from './index.js'
import { roles } from './schema.js'

// В изолированном режиме (BIO_EXAM_ISOLATED_ENV=1) .env не загружается: переменные только от вызывающего
if (!isIsolatedEnv()) loadDotenv()

async function main() {
	// Инициализация ролей из RBAC пакета
	await db
		.insert(roles)
		.values(ROLE_KEYS.map((key) => ({ key })))
		.onConflictDoNothing()

	console.log('Seed OK')
}
main().catch((e) => {
	console.error(e)
	process.exit(1)
})
