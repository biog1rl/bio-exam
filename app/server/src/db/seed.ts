import { ROLE_KEYS } from '@bio-exam/rbac'

import 'dotenv/config'

import { db } from './index.js'
import { roles } from './schema.js'

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
