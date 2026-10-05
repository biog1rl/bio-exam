import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { isIsolatedEnv } from '../config/test-database-url.js'

const SNAPSHOT_PATH = fileURLToPath(new URL('../../route-inventory.txt', import.meta.url))

async function main(): Promise<number> {
	if (!isIsolatedEnv()) {
		console.error('routes:inventory runs only with BIO_EXAM_ISOLATED_ENV=1 (node scripts/with-test-db.mjs -- ...)')
		return 1
	}
	const check = process.argv.slice(2).includes('--check')
	const app = (await import('../app.js')).default
	const { pgPool } = await import('../db/index.js')
	const { firstDifference, inventoryText } = await import('../lib/route-inventory.js')
	try {
		const actual = inventoryText(app)
		if (!check) {
			fs.writeFileSync(SNAPSHOT_PATH, actual)
			console.log(`routes:inventory wrote ${actual.split('\n').length - 1} lines to app/server/route-inventory.txt`)
			return 0
		}
		const expected = fs.existsSync(SNAPSHOT_PATH) ? fs.readFileSync(SNAPSHOT_PATH, 'utf8') : ''
		const difference = firstDifference(expected, actual)
		if (difference) {
			console.error(`routes:inventory --check: app/server/route-inventory.txt is stale, ${difference}`)
			return 1
		}
		console.log('routes:inventory --check: OK')
		return 0
	} finally {
		await pgPool.end()
	}
}

main().then(
	(code) => process.exit(code),
	(error: unknown) => {
		console.error(error instanceof Error ? error.message : error)
		process.exit(1)
	}
)
