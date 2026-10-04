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
const SESSIONS_TAG = '0022_attempt_sessions'
const SESSIONS_FILE = path.join(MIGRATIONS_FOLDER, `${SESSIONS_TAG}.sql`)
const RESULTS_VERSION_TAG = '0023_attempt_results_version'
const RESULTS_VERSION_FILE = path.join(MIGRATIONS_FOLDER, `${RESULTS_VERSION_TAG}.sql`)
const LAST_APPLIED_IDX = 21

const USER_ONE = '11111111-1111-4111-8111-111111111111'
const USER_TWO = '22222222-2222-4222-8222-222222222222'
const TOPIC = '33333333-3333-4333-8333-333333333333'
const TEST_ONE = 'a1a1a1a1-0000-4000-8000-0000000000a1'
const TEST_TWO = 'a2a2a2a2-0000-4000-8000-0000000000a2'
const ATTEMPT_ONE = 'b1b1b1b1-0000-4000-8000-0000000000b1'

const SESSIONS = {
	S1: '51000000-0000-4000-8000-000000000001',
	S2: '52000000-0000-4000-8000-000000000002',
	S3: '53000000-0000-4000-8000-000000000003',
	S4: '54000000-0000-4000-8000-000000000004',
	S5: '55000000-0000-4000-8000-000000000005',
	S6: '56000000-0000-4000-8000-000000000006',
	S7: '57000000-0000-4000-8000-000000000007',
} as const

const S1_DRAFT = { q1: 'b', q2: ['a', 'c'] }

type SessionRow = {
	id: string
	test_id: string
	user_id: string
	started_at: Date
	submitted_at: Date | null
	attempt_id: string | null
	draft_answers: unknown
	draft_updated_at: Date | null
}

type ManifestEntry = { idx: number; tag: string; file: string; sha256: string; when: number }

let scratch: ScratchDatabase | null = null
let pool: Pool | null = null
let copyDir: string | null = null
let sessionsBefore = new Map<string, SessionRow>()
let attemptCountBefore = 0
let attemptIdsBefore: string[] = []

function db(): Pool {
	assert.ok(pool)
	return pool
}

function readManifest(): ManifestEntry[] {
	const manifest = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, 'migrations-manifest.json'), 'utf8')) as {
		migrations: ManifestEntry[]
	}
	return manifest.migrations
}

function cleanupStatement(): string {
	const statements = fs
		.readFileSync(SESSIONS_FILE, 'utf8')
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter((statement) => statement.startsWith('UPDATE "test_sessions"'))
	assert.equal(statements.length, 1, 'cleanup must be one UPDATE "test_sessions" statement')
	return statements[0] as string
}

async function readSessions(): Promise<Map<string, SessionRow>> {
	const { rows } = await db().query<SessionRow>(
		'SELECT id, test_id, user_id, started_at, submitted_at, attempt_id, draft_answers, draft_updated_at FROM test_sessions ORDER BY id'
	)
	return new Map(rows.map((row) => [row.id, row]))
}

async function countRows(table: 'test_sessions' | 'test_attempts'): Promise<number> {
	const { rows } = await db().query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)
	return Number(rows[0]?.count)
}

async function migrationCount(): Promise<number> {
	const { rows } = await db().query<{ count: string }>('SELECT count(*)::text AS count FROM __drizzle_migrations')
	return Number(rows[0]?.count)
}

function hasCode(code: string) {
	return (error: unknown) => {
		assert.equal((error as { code?: string }).code, code)
		return true
	}
}

function prepareMigrationsUpToLastApplied(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-attempt-mig-drizzle-'))
	fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true })
	const journalFile = path.join(dir, 'meta/_journal.json')
	const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8')) as { entries: Array<{ idx: number; tag: string }> }
	const dropped = journal.entries.filter((entry) => entry.idx > LAST_APPLIED_IDX)
	journal.entries = journal.entries.filter((entry) => entry.idx <= LAST_APPLIED_IDX)
	fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2))
	for (const entry of dropped) {
		fs.rmSync(path.join(dir, `${entry.tag}.sql`), { force: true })
		fs.rmSync(path.join(dir, `meta/${entry.tag.slice(0, 4)}_snapshot.json`), { force: true })
	}
	return dir
}

async function insertSession(
	id: string,
	testId: string,
	userId: string,
	startedAt: string,
	extra: { submittedAt?: string; attemptId?: string; draft?: unknown } = {}
): Promise<void> {
	await db().query(
		`INSERT INTO test_sessions (id, test_id, user_id, started_at, submitted_at, attempt_id, draft_answers, draft_updated_at)
		VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7::jsonb, CASE WHEN $7::jsonb IS NULL THEN NULL ELSE $4::timestamptz END)`,
		[
			id,
			testId,
			userId,
			startedAt,
			extra.submittedAt ?? null,
			extra.attemptId ?? null,
			extra.draft === undefined ? null : JSON.stringify(extra.draft),
		]
	)
}

async function insertAttempt(id: string, testId: string, userId: string, sessionId?: string): Promise<void> {
	const columns = sessionId === undefined ? '' : ', session_id'
	const values = sessionId === undefined ? '' : ', $5'
	const params: unknown[] = [id, testId, userId, JSON.stringify([{ questionId: 'q1', isCorrect: true, points: 1 }])]
	if (sessionId !== undefined) params.push(sessionId)
	await db().query(
		`INSERT INTO test_attempts (id, test_id, user_id, answers, results, earned_points, total_points, score_percentage, passed${columns})
		VALUES ($1, $2, $3, '{"q1":"b"}'::jsonb, $4::jsonb, 1, 1, 100, true${values})`,
		params
	)
}

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_attempt_mig')
	copyDir = prepareMigrationsUpToLastApplied()
	pool = new Pool({ connectionString: scratch.url })
	await migrate(drizzle(pool), { migrationsFolder: copyDir, migrationsSchema: 'public' })
	assert.equal(await migrationCount(), LAST_APPLIED_IDX + 1)

	const closedColumn = await db().query(
		"SELECT 1 FROM information_schema.columns WHERE table_name = 'test_sessions' AND column_name = 'closed_at'"
	)
	assert.equal(closedColumn.rows.length, 0)

	await db().query(
		`INSERT INTO users (id, login, name, is_active) VALUES ($1, 'mig-one', 'Mig One', true), ($2, 'mig-two', 'Mig Two', true)`,
		[USER_ONE, USER_TWO]
	)
	await db().query(`INSERT INTO topics (id, slug, title) VALUES ($1, 'mig-topic', 'Mig Topic')`, [TOPIC])
	await db().query(
		`INSERT INTO tests (id, topic_id, slug, title, time_limit_minutes) VALUES ($1, $3, 'mig-t1', 'Mig T1', NULL), ($2, $3, 'mig-t2', 'Mig T2', 10)`,
		[TEST_ONE, TEST_TWO, TOPIC]
	)
	await insertAttempt(ATTEMPT_ONE, TEST_ONE, USER_ONE)

	await insertSession(SESSIONS.S1, TEST_ONE, USER_ONE, '2026-09-01T10:00:00.000Z', { draft: S1_DRAFT })
	await insertSession(SESSIONS.S2, TEST_ONE, USER_ONE, '2026-09-02T10:00:00.000Z')
	await insertSession(SESSIONS.S3, TEST_ONE, USER_ONE, '2026-08-20T10:00:00.000Z', {
		submittedAt: '2026-08-20T10:30:00.000Z',
		attemptId: ATTEMPT_ONE,
	})
	await insertSession(SESSIONS.S4, TEST_TWO, USER_ONE, '2026-09-03T10:00:00.000Z')
	await insertSession(SESSIONS.S5, TEST_TWO, USER_ONE, '2026-09-03T10:00:00.000Z')
	await insertSession(SESSIONS.S6, TEST_ONE, USER_TWO, '2026-09-04T10:00:00.000Z')
	await insertSession(SESSIONS.S7, TEST_ONE, USER_ONE, '2026-08-21T10:00:00.000Z', {
		submittedAt: '2026-08-21T10:30:00.000Z',
		attemptId: ATTEMPT_ONE,
	})

	sessionsBefore = await readSessions()
	attemptCountBefore = await countRows('test_attempts')
	const attemptIds = await db().query<{ id: string }>('SELECT id FROM test_attempts ORDER BY id')
	attemptIdsBefore = attemptIds.rows.map((row) => row.id)

	await migrateTestDatabase(scratch.url)
}, 120_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
	if (copyDir) fs.rmSync(copyDir, { recursive: true, force: true })
})

describe('0022_attempt_sessions applied over duplicate open sessions', () => {
	test('the real migrator applies the new migrations and records the manifest sha256 of 0022', async () => {
		const manifest = readManifest()
		assert.equal(await migrationCount(), manifest.length)
		const entry = manifest.find((migration) => migration.idx === 22)
		assert.ok(entry)
		assert.equal(entry.tag, SESSIONS_TAG)
		assert.equal(entry.sha256, crypto.createHash('sha256').update(fs.readFileSync(SESSIONS_FILE)).digest('hex'))
		const { rows } = await db().query<{ hash: string }>('SELECT hash FROM __drizzle_migrations WHERE created_at = $1', [
			entry.when,
		])
		assert.equal(rows.length, 1)
		assert.equal(rows[0]?.hash, entry.sha256)
	})

	test('only the newest open session per pair stays open, older ones are closed as superseded', async () => {
		const { rows } = await db().query<{ id: string; closed_at: Date | null; close_reason: string | null }>(
			'SELECT id, closed_at, close_reason FROM test_sessions ORDER BY id'
		)
		const byId = new Map(rows.map((row) => [row.id, row]))
		const open = rows
			.filter((row) => sessionsBefore.get(row.id)?.submitted_at === null && row.closed_at === null)
			.map((row) => row.id)
		assert.deepEqual(open, [SESSIONS.S2, SESSIONS.S5, SESSIONS.S6])
		for (const id of [SESSIONS.S1, SESSIONS.S4]) {
			const row = byId.get(id)
			assert.ok(row, id)
			assert.notEqual(row.closed_at, null, id)
			assert.equal(row.close_reason, 'superseded', id)
		}
		for (const id of [SESSIONS.S2, SESSIONS.S3, SESSIONS.S5, SESSIONS.S6, SESSIONS.S7]) {
			const row = byId.get(id)
			assert.ok(row, id)
			assert.equal(row.closed_at, null, id)
			assert.equal(row.close_reason, null, id)
		}
	})

	test('no rows are deleted and existing columns, drafts and submitted sessions are unchanged', async () => {
		assert.equal(await countRows('test_sessions'), sessionsBefore.size)
		assert.equal(await countRows('test_attempts'), attemptCountBefore)
		assert.deepEqual(await readSessions(), sessionsBefore)
		assert.deepEqual(sessionsBefore.get(SESSIONS.S1)?.draft_answers, S1_DRAFT)
		const { rows } = await db().query<{ session_id: string | null }>(
			'SELECT session_id FROM test_attempts WHERE id = $1',
			[ATTEMPT_ONE]
		)
		assert.equal(rows[0]?.session_id, null)
	})

	test('running the cleanup statement from 0022 again changes nothing', async () => {
		const result = await db().query(cleanupStatement())
		assert.equal(result.rowCount, 0)
	})

	test('both unique indexes are partial', async () => {
		for (const name of ['test_sessions_open_uniq', 'test_attempts_session_id_uniq']) {
			const { rows } = await db().query<{ indexdef: string }>(
				"SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1",
				[name]
			)
			assert.equal(rows.length, 1, name)
			assert.match(rows[0]?.indexdef ?? '', /UNIQUE INDEX/, name)
			assert.match(rows[0]?.indexdef ?? '', /WHERE/, name)
		}
	})

	test('a second open session for the same pair is rejected with 23505', async () => {
		await assert.rejects(
			insertSession(crypto.randomUUID(), TEST_ONE, USER_TWO, '2026-09-05T10:00:00.000Z'),
			hasCode('23505')
		)
	})

	test('two attempts with one session_id are rejected with 23505', async () => {
		await insertAttempt(crypto.randomUUID(), TEST_ONE, USER_ONE, SESSIONS.S2)
		await assert.rejects(insertAttempt(crypto.randomUUID(), TEST_ONE, USER_ONE, SESSIONS.S2), hasCode('23505'))
	})

	test('an unknown close_reason is rejected with 23514', async () => {
		await assert.rejects(
			db().query("UPDATE test_sessions SET closed_at = now(), close_reason = 'other' WHERE id = $1", [SESSIONS.S6]),
			hasCode('23514')
		)
	})
})

describe('0023_attempt_results_version applied over existing attempts', () => {
	test('the real migrator records the manifest sha256 of 0023', async () => {
		const entry = readManifest().find((migration) => migration.idx === 23)
		assert.ok(entry)
		assert.equal(entry.tag, RESULTS_VERSION_TAG)
		assert.equal(entry.sha256, crypto.createHash('sha256').update(fs.readFileSync(RESULTS_VERSION_FILE)).digest('hex'))
		const { rows } = await db().query<{ hash: string }>('SELECT hash FROM __drizzle_migrations WHERE created_at = $1', [
			entry.when,
		])
		assert.equal(rows.length, 1)
		assert.equal(rows[0]?.hash, entry.sha256)
	})

	test('attempts inserted before the migration get results_version 1', async () => {
		assert.deepEqual(attemptIdsBefore, [ATTEMPT_ONE])
		const { rows } = await db().query<{ id: string; results_version: number }>(
			'SELECT id, results_version FROM test_attempts WHERE id = ANY($1::uuid[]) ORDER BY id',
			[attemptIdsBefore]
		)
		assert.equal(rows.length, attemptIdsBefore.length)
		for (const row of rows) assert.equal(row.results_version, 1, row.id)
	})

	test('a new attempt without an explicit value gets results_version 1', async () => {
		const id = crypto.randomUUID()
		await insertAttempt(id, TEST_TWO, USER_TWO)
		const { rows } = await db().query<{ results_version: number }>(
			'SELECT results_version FROM test_attempts WHERE id = $1',
			[id]
		)
		assert.equal(rows[0]?.results_version, 1)
	})

	test('results_version outside 1 and 2 is rejected with 23514', async () => {
		await assert.rejects(
			db().query('UPDATE test_attempts SET results_version = 3 WHERE id = $1', [ATTEMPT_ONE]),
			hasCode('23514')
		)
	})
})
