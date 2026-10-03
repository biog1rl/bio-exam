import { eq } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
/**
 * Регрессия timestamptz (research C3, D-28): столбцы timestamptz из миграций должны читаться
 * через drizzle тем же моментом времени при любом часовом поясе сессии.
 * Объявление timestamp() без withTimezone сдвигает значение на смещение пояса сессии.
 *
 * Тест работает с базой: запускать через node scripts/with-test-db.mjs -- … или yarn verify.
 */
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../test-support/test-database.js'
import * as schema from './schema.js'

const INSTANT = new Date('2026-09-26T10:11:12.345Z')
const ZONES = ['Asia/Bangkok', 'America/New_York', 'UTC']

let scratch: ScratchDatabase | null = null

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_ts')
	await migrateTestDatabase(scratch.url)
}, 60_000)

afterAll(async () => {
	await scratch?.drop()
})

/** drizzle с заданным часовым поясом сессии; пул закрывается после fn */
async function withZone<T>(zone: string, fn: (db: NodePgDatabase<typeof schema>) => Promise<T>) {
	assert.ok(scratch, 'scratch database is not ready')
	const pool = new Pool({ connectionString: scratch.url, options: `-c timezone=${zone}` })
	try {
		const { rows } = await pool.query<{ TimeZone: string }>('SHOW timezone')
		assert.equal(rows[0]?.TimeZone, zone)
		return await fn(drizzle(pool, { schema }))
	} finally {
		await pool.end()
	}
}

/** Логин, уникальный для пояса и сценария */
function loginFor(zone: string, scenario: string) {
	return `ts_${scenario}_${zone.replace(/[^a-z]/gi, '_').toLowerCase()}`
}

describe('timestamptz round trip', () => {
	for (const zone of ZONES) {
		test(`users.locked_until keeps the instant under ${zone}`, async () => {
			await withZone(zone, async (db) => {
				const [created] = await db
					.insert(schema.users)
					.values({ login: loginFor(zone, 'lock'), lockedUntil: INSTANT })
					.returning({ id: schema.users.id })
				assert.ok(created)
				const [row] = await db
					.select({ lockedUntil: schema.users.lockedUntil })
					.from(schema.users)
					.where(eq(schema.users.id, created.id))
				assert.ok(row?.lockedUntil)
				assert.equal(row.lockedUntil.getTime(), INSTANT.getTime())
			})
		})

		test(`refresh_tokens.expires_at keeps the instant under ${zone}`, async () => {
			await withZone(zone, async (db) => {
				const [user] = await db
					.insert(schema.users)
					.values({ login: loginFor(zone, 'token') })
					.returning({ id: schema.users.id })
				assert.ok(user)
				const [created] = await db
					.insert(schema.refreshTokens)
					.values({ userId: user.id, tokenHash: `hash_${zone}`, expiresAt: INSTANT })
					.returning({ id: schema.refreshTokens.id })
				assert.ok(created)
				const [row] = await db
					.select({ expiresAt: schema.refreshTokens.expiresAt })
					.from(schema.refreshTokens)
					.where(eq(schema.refreshTokens.id, created.id))
				assert.ok(row)
				assert.equal(row.expiresAt.getTime(), INSTANT.getTime())
			})
		})
	}
})
