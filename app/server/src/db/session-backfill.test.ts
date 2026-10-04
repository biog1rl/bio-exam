import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../test-support/test-database.js'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))
const MIGRATION_TAG = '0021_auth_sessions'
const MIGRATION_FILE = path.join(MIGRATIONS_FOLDER, `${MIGRATION_TAG}.sql`)

type TokenRow = {
	id: string
	user_id: string
	session_id: string | null
	used_at: Date | null
	revoked_at: Date | null
	created_at: Date
}

type SessionRow = {
	id: string
	user_id: string
	created_at: Date
	last_refreshed_at: Date
	revoked_at: Date | null
	revoke_reason: string | null
}

const USER_ONE = '11111111-1111-4111-8111-111111111111'
const USER_TWO = '22222222-2222-4222-8222-222222222222'

const TOKENS = {
	A: { id: 'aaaaaaaa-0000-4000-8000-00000000000a', userId: USER_ONE, createdAt: '2026-09-01T10:00:00.000Z' },
	B: { id: 'bbbbbbbb-0000-4000-8000-00000000000b', userId: USER_ONE, createdAt: '2026-09-02T11:30:00.000Z' },
	C: { id: 'cccccccc-0000-4000-8000-00000000000c', userId: USER_ONE, createdAt: '2026-09-03T12:00:00.000Z' },
	D: { id: 'dddddddd-0000-4000-8000-00000000000d', userId: USER_ONE, createdAt: '2026-08-01T09:00:00.000Z' },
	E: { id: 'eeeeeeee-0000-4000-8000-00000000000e', userId: USER_TWO, createdAt: '2026-09-04T08:15:00.000Z' },
} as const

const ACTIVE = ['A', 'B', 'E'] as const
const INACTIVE = ['C', 'D'] as const

let scratch: ScratchDatabase | null = null
let pool: Pool | null = null
let copyDir: string | null = null

function db(): Pool {
	assert.ok(pool)
	return pool
}

function backfillStatements(): string[] {
	const statements = fs
		.readFileSync(MIGRATION_FILE, 'utf8')
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter(
			(statement) =>
				statement.startsWith('INSERT INTO "auth_sessions"') || statement.startsWith('UPDATE "refresh_tokens"')
		)
	assert.equal(
		statements.length,
		2,
		'backfill must be two statements: INSERT INTO auth_sessions and UPDATE refresh_tokens'
	)
	return statements
}

async function readTokens(): Promise<Map<string, TokenRow>> {
	const { rows } = await db().query<TokenRow>(
		'SELECT id, user_id, session_id, used_at, revoked_at, created_at FROM refresh_tokens ORDER BY id'
	)
	return new Map(rows.map((row) => [row.id, row]))
}

async function readSessions(): Promise<SessionRow[]> {
	const { rows } = await db().query<SessionRow>(
		'SELECT id, user_id, created_at, last_refreshed_at, revoked_at, revoke_reason FROM auth_sessions ORDER BY id'
	)
	return rows
}

async function migrationCount(): Promise<number> {
	const { rows } = await db().query<{ count: string }>('SELECT count(*)::text AS count FROM __drizzle_migrations')
	return Number(rows[0]?.count)
}

function prepareMigrationsUpTo0020(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-backfill-drizzle-'))
	fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true })
	const journalFile = path.join(dir, 'meta/_journal.json')
	const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')) as { entries: Array<{ idx: number }> }
	journal.entries = journal.entries.filter((entry) => entry.idx <= 20)
	fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2))
	for (const file of fs.readdirSync(dir)) {
		if (file.startsWith('0021_')) fs.rmSync(path.join(dir, file))
	}
	fs.rmSync(path.join(dir, 'meta/0021_snapshot.json'), { force: true })
	return dir
}

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_auth_backfill')
	copyDir = prepareMigrationsUpTo0020()
	pool = new Pool({ connectionString: scratch.url })
	await migrate(drizzle(pool), { migrationsFolder: copyDir, migrationsSchema: 'public' })
	assert.equal(await migrationCount(), 21)

	const sessionTable = await db().query("SELECT to_regclass('public.auth_sessions') AS name")
	assert.equal(sessionTable.rows[0]?.name, null)

	await db().query(
		`INSERT INTO users (id, login, name, is_active) VALUES ($1, 'backfill-one', 'Backfill One', true), ($2, 'backfill-two', 'Backfill Two', true)`,
		[USER_ONE, USER_TWO]
	)
	const insertToken = `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
		VALUES ($1, $2, $3, now() + $4::interval, CASE WHEN $5::boolean THEN now() - interval '1 hour' END, $6::timestamptz)`
	await db().query(insertToken, [TOKENS.A.id, TOKENS.A.userId, 'hash-a', '30 days', false, TOKENS.A.createdAt])
	await db().query(insertToken, [TOKENS.B.id, TOKENS.B.userId, 'hash-b', '10 days', false, TOKENS.B.createdAt])
	await db().query(insertToken, [TOKENS.C.id, TOKENS.C.userId, 'hash-c', '30 days', true, TOKENS.C.createdAt])
	await db().query(insertToken, [TOKENS.D.id, TOKENS.D.userId, 'hash-d', '-1 day', false, TOKENS.D.createdAt])
	await db().query(insertToken, [TOKENS.E.id, TOKENS.E.userId, 'hash-e', '30 days', false, TOKENS.E.createdAt])

	await migrateTestDatabase(scratch.url)
}, 120_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
	if (copyDir) fs.rmSync(copyDir, { recursive: true, force: true })
})

describe('0021_auth_sessions applied over existing refresh tokens', () => {
	test('the real migrator applies only 0021 and records its manifest sha256', async () => {
		assert.equal(await migrationCount(), 22)
		const manifest = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, 'migrations-manifest.json'), 'utf8')) as {
			migrations: Array<{ idx: number; tag: string; sha256: string; when: number }>
		}
		const entry = manifest.migrations.find((migration) => migration.idx === 21)
		assert.ok(entry)
		assert.equal(entry.tag, MIGRATION_TAG)
		assert.equal(entry.sha256, crypto.createHash('sha256').update(fs.readFileSync(MIGRATION_FILE)).digest('hex'))
		const { rows } = await db().query<{ hash: string; created_at: string }>(
			'SELECT hash, created_at::text AS created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1'
		)
		assert.equal(rows[0]?.hash, entry.sha256)
		assert.equal(Number(rows[0]?.created_at), entry.when)
	})

	test('active tokens A, B, E get a session with the token id; revoked C and expired D stay without one', async () => {
		const sessions = await readSessions()
		const tokens = await readTokens()
		assert.deepEqual(
			sessions.map((session) => session.id),
			ACTIVE.map((key) => TOKENS[key].id).sort()
		)
		for (const key of ACTIVE) {
			const token = TOKENS[key]
			const session = sessions.find((row) => row.id === token.id)
			assert.ok(session, key)
			assert.equal(session.user_id, token.userId, key)
			assert.equal(session.created_at.toISOString(), token.createdAt, key)
			assert.equal(session.last_refreshed_at.toISOString(), token.createdAt, key)
			assert.equal(session.revoked_at, null, key)
			assert.equal(session.revoke_reason, null, key)
			assert.equal(tokens.get(token.id)?.session_id, token.id, key)
		}
		for (const key of INACTIVE) {
			assert.equal(tokens.get(TOKENS[key].id)?.session_id, null, key)
		}
		assert.equal(tokens.size, 5)
		for (const token of tokens.values()) assert.equal(token.used_at, null, token.id)
	})

	test('running the backfill statements again changes nothing', async () => {
		const sessionsBefore = await readSessions()
		const tokensBefore = await readTokens()
		for (const statement of backfillStatements()) {
			const result = await db().query(statement)
			assert.equal(result.rowCount, 0, statement)
		}
		assert.deepEqual(await readSessions(), sessionsBefore)
		assert.deepEqual(await readTokens(), tokensBefore)
	})

	test('auth_sessions and login_throttle have RLS and the deny_direct_access policy', async () => {
		for (const table of ['auth_sessions', 'login_throttle']) {
			const rls = await db().query<{ relrowsecurity: boolean }>(
				"SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || $1)",
				[table]
			)
			assert.equal(rls.rows[0]?.relrowsecurity, true, table)
			const policy = await db().query<{ qual: string; with_check: string; cmd: string }>(
				"SELECT qual, with_check, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = 'deny_direct_access'",
				[table]
			)
			assert.equal(policy.rows.length, 1, table)
			assert.equal(policy.rows[0]?.cmd, 'ALL', table)
			assert.equal(policy.rows[0]?.qual, 'false', table)
			assert.equal(policy.rows[0]?.with_check, 'false', table)
		}
	})
})
