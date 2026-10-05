import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { firstDifference, inventoryText } from '../lib/route-inventory.js'
import { requireTestDatabaseUrl } from '../test-support/test-database.js'

const SNAPSHOT_PATH = fileURLToPath(new URL('../../route-inventory.txt', import.meta.url))

let app: unknown
let closePool: (() => Promise<void>) | null = null

beforeAll(async () => {
	requireTestDatabaseUrl()
	app = (await import('../app.js')).default
	const { pgPool } = await import('../db/index.js')
	closePool = () => pgPool.end()
})

afterAll(async () => {
	await closePool?.()
})

describe('инвентарь маршрутов', () => {
	test('сгенерированный инвентарь совпадает со снимком app/server/route-inventory.txt', () => {
		const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf8')
		const actual = inventoryText(app)
		const difference = firstDifference(expected, actual)
		assert.equal(
			difference,
			null,
			`инвентарь маршрутов изменился: перегенерируйте снимок командой routes:inventory и положите diff в SUMMARY (${difference})`
		)
	})

	test('порядок регистрации: /healthz, /api/users, /api/tests раньше /api/tests/public', () => {
		const lines = inventoryText(app).split('\n')
		const at = (line: string) => {
			const index = lines.indexOf(line)
			assert.ok(index >= 0, `нет строки ${line}`)
			return index
		}
		const healthz = at('GET /healthz  <anonymous>')
		const users = at('GET /api/users  sessionRequired > requirePerm(users.read) > <anonymous>')
		const topics = at('GET /api/tests/topics  sessionRequired > requirePerm(tests.read) > <anonymous>')
		const byId = at('GET /api/tests/:id  validateUUID(id) > sessionRequired > <anonymous>')
		const assignments = at('GET /api/tests/:testId/assignments  validateUUID(testId) > sessionRequired > <anonymous>')
		const publicTests = at('GET /api/tests/public/tests  sessionRequired > <anonymous>')
		assert.ok(healthz < users && users < topics && topics < byId && byId < assignments && assignments < publicTests)
	})
})
