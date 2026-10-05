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

type JournalEntry = { idx: number; tag: string; when: number }

type ManifestEntry = { idx: number; tag: string; file: string; sha256: string; when: number }

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))
const LAST_APPLIED_IDX = 25

const USER = '81000000-0000-4000-8000-000000000001'
const TOPIC = '82000000-0000-4000-8000-000000000002'
const TEST_WITH_THRESHOLD = '83000000-0000-4000-8000-000000000003'
const TEST_WITHOUT_THRESHOLD = '84000000-0000-4000-8000-000000000004'
const SESSION_ONE = '85000000-0000-4000-8000-000000000005'
const SESSION_TWO = '86000000-0000-4000-8000-000000000006'
const ATTEMPT_FULL = '87000000-0000-4000-8000-000000000007'
const ATTEMPT_HALF = '88000000-0000-4000-8000-000000000008'
const ATTEMPT_ZERO = '89000000-0000-4000-8000-000000000009'

const LEGACY_ATTEMPTS = [
	{
		id: ATTEMPT_FULL,
		testId: TEST_WITH_THRESHOLD,
		earned: 10,
		total: 10,
		percent: 100,
		passed: true,
		session: SESSION_ONE,
	},
	{ id: ATTEMPT_HALF, testId: TEST_WITH_THRESHOLD, earned: 5, total: 10, percent: 50, passed: false, session: null },
	{
		id: ATTEMPT_ZERO,
		testId: TEST_WITHOUT_THRESHOLD,
		earned: 0,
		total: 4,
		percent: 0,
		passed: true,
		session: SESSION_TWO,
	},
] as const

const RECONCILIATION_SQL = `SELECT count(*)::int AS attempts,
	count(*) FILTER (WHERE review_status = 'none')::int AS none_count,
	count(*) FILTER (WHERE final_earned_points IS DISTINCT FROM earned_points OR final_score_percentage IS DISTINCT FROM score_percentage OR final_passed IS DISTINCT FROM passed OR auto_total_points IS DISTINCT FROM total_points)::int AS mismatched
FROM test_attempts`

let scratch: ScratchDatabase | null = null
let pool: Pool | null = null
let copyDir: string | null = null

function db(): Pool {
	assert.ok(pool)
	return pool
}

function readJournal(folder: string): { entries: JournalEntry[] } {
	return JSON.parse(fs.readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8')) as { entries: JournalEntry[] }
}

function projectionEntry(): JournalEntry {
	const entry = readJournal(MIGRATIONS_FOLDER).entries.find((item) => item.tag.endsWith('_attempt_result_projection'))
	assert.ok(entry, 'journal has no *_attempt_result_projection entry')
	return entry
}

function projectionFile(): string {
	return path.join(MIGRATIONS_FOLDER, `${projectionEntry().tag}.sql`)
}

function readManifest(): ManifestEntry[] {
	const manifest = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, 'migrations-manifest.json'), 'utf8')) as {
		migrations: ManifestEntry[]
	}
	return manifest.migrations
}

function seedStatement(): string {
	const statements = fs
		.readFileSync(projectionFile(), 'utf8')
		.split('--> statement-breakpoint')
		.map((statement) => statement.trim())
		.filter((statement) => statement.startsWith('INSERT INTO "question_types"'))
	assert.equal(statements.length, 1, 'seed must be one INSERT INTO "question_types" statement')
	return statements[0] as string
}

function prepareMigrationsUpToLastApplied(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-attempt-result-drizzle-'))
	fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true })
	const journalFile = path.join(dir, 'meta/_journal.json')
	const journal = readJournal(dir)
	const dropped = journal.entries.filter((entry) => entry.idx > LAST_APPLIED_IDX)
	journal.entries = journal.entries.filter((entry) => entry.idx <= LAST_APPLIED_IDX)
	fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2))
	for (const entry of dropped) {
		fs.rmSync(path.join(dir, `${entry.tag}.sql`), { force: true })
		fs.rmSync(path.join(dir, `meta/${entry.tag.slice(0, 4)}_snapshot.json`), { force: true })
	}
	return dir
}

async function migrationCount(): Promise<number> {
	const { rows } = await db().query<{ count: string }>('SELECT count(*)::text AS count FROM __drizzle_migrations')
	return Number(rows[0]?.count)
}

function rejectedWith(code: string, constraint?: string) {
	return (error: unknown) => {
		const pgError = error as { code?: string; constraint?: string }
		assert.equal(pgError.code, code)
		if (constraint !== undefined) assert.equal(pgError.constraint, constraint)
		return true
	}
}

async function sessionOf(attemptId: string): Promise<string | null | undefined> {
	const { rows } = await db().query<{ session_id: string | null }>(
		'SELECT session_id FROM test_attempts WHERE id = $1',
		[attemptId]
	)
	return rows[0]?.session_id
}

beforeAll(async () => {
	requireTestDatabaseUrl()
	assert.equal(projectionEntry().idx, LAST_APPLIED_IDX + 1)
	scratch = await createScratchDatabase('test_attempt_result_mig')
	copyDir = prepareMigrationsUpToLastApplied()
	pool = new Pool({ connectionString: scratch.url })
	await migrate(drizzle(pool), { migrationsFolder: copyDir, migrationsSchema: 'public' })
	assert.equal(await migrationCount(), LAST_APPLIED_IDX + 1)

	await db().query(`INSERT INTO users (id, login, name, is_active) VALUES ($1, 'result-mig', 'Result Mig', true)`, [
		USER,
	])
	await db().query(`INSERT INTO topics (id, slug, title) VALUES ($1, 'result-mig-topic', 'Result Mig Topic')`, [TOPIC])
	await db().query(
		`INSERT INTO tests (id, topic_id, slug, title, passing_score) VALUES ($1, $3, 'result-mig-t1', 'Result Mig T1', 60), ($2, $3, 'result-mig-t2', 'Result Mig T2', NULL)`,
		[TEST_WITH_THRESHOLD, TEST_WITHOUT_THRESHOLD, TOPIC]
	)
	await db().query(
		`INSERT INTO test_sessions (id, test_id, user_id, started_at) VALUES ($1, $3, $5, now()), ($2, $4, $5, now())`,
		[SESSION_ONE, SESSION_TWO, TEST_WITH_THRESHOLD, TEST_WITHOUT_THRESHOLD, USER]
	)
	for (const attempt of LEGACY_ATTEMPTS) {
		await db().query(
			`INSERT INTO test_attempts (id, test_id, user_id, answers, results, earned_points, total_points, score_percentage, passed, session_id)
			VALUES ($1, $2, $3, '{"q1":"b"}'::jsonb, '[]'::jsonb, $4, $5, $6, $7, $8)`,
			[
				attempt.id,
				attempt.testId,
				USER,
				attempt.earned,
				attempt.total,
				attempt.percent,
				attempt.passed,
				attempt.session,
			]
		)
	}

	await migrateTestDatabase(scratch.url)
}, 120_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
	if (copyDir) fs.rmSync(copyDir, { recursive: true, force: true })
})

describe('0026_attempt_result_projection applied over existing attempts', () => {
	test('the real migrator records the manifest sha256 of 0026', async () => {
		const target = projectionEntry()
		const manifest = readManifest()
		assert.equal(await migrationCount(), manifest.length)
		const entry = manifest.find((migration) => migration.idx === target.idx)
		assert.ok(entry)
		assert.equal(entry.tag, target.tag)
		assert.equal(entry.when, target.when)
		assert.equal(entry.sha256, crypto.createHash('sha256').update(fs.readFileSync(projectionFile())).digest('hex'))
		const { rows } = await db().query<{ hash: string }>('SELECT hash FROM __drizzle_migrations WHERE created_at = $1', [
			entry.when,
		])
		assert.equal(rows.length, 1)
		assert.equal(rows[0]?.hash, entry.sha256)
	})

	test('existing attempts get review_status none, final_* equal to facts and the current test threshold', async () => {
		const { rows } = await db().query<{
			id: string
			review_status: string
			passing_score: number | null
			graded_at: Date | null
			submit_source: string
			final_matches: boolean
		}>(
			`SELECT id, review_status, passing_score, graded_at, submit_source,
				(final_earned_points IS NOT DISTINCT FROM earned_points
					AND final_score_percentage IS NOT DISTINCT FROM score_percentage
					AND final_passed IS NOT DISTINCT FROM passed
					AND auto_total_points IS NOT DISTINCT FROM total_points) AS final_matches
			FROM test_attempts ORDER BY id`
		)
		assert.deepEqual(
			rows.map((row) => ({ ...row })),
			[
				{
					id: ATTEMPT_FULL,
					review_status: 'none',
					passing_score: 60,
					graded_at: null,
					submit_source: 'client',
					final_matches: true,
				},
				{
					id: ATTEMPT_HALF,
					review_status: 'none',
					passing_score: 60,
					graded_at: null,
					submit_source: 'client',
					final_matches: true,
				},
				{
					id: ATTEMPT_ZERO,
					review_status: 'none',
					passing_score: null,
					graded_at: null,
					submit_source: 'client',
					final_matches: true,
				},
			]
		)
	})

	test('the reconciliation query for the rollout returns attempts = none_count and mismatched = 0', async () => {
		const { rows } = await db().query<{ attempts: number; none_count: number; mismatched: number }>(RECONCILIATION_SQL)
		assert.deepEqual(rows[0], { attempts: LEGACY_ATTEMPTS.length, none_count: LEGACY_ATTEMPTS.length, mismatched: 0 })
	})

	test('pending with a final result is rejected with 23514', async () => {
		await assert.rejects(
			db().query("UPDATE test_attempts SET review_status = 'pending' WHERE id = $1", [ATTEMPT_HALF]),
			rejectedWith('23514', 'test_attempts_review_projection_check')
		)
	})

	test('none without a final result is rejected with 23514', async () => {
		await assert.rejects(
			db().query(
				`INSERT INTO test_attempts (test_id, user_id, answers, results, earned_points, total_points, score_percentage, passed, auto_total_points)
				VALUES ($1, $2, '{}'::jsonb, '[]'::jsonb, 1, 1, 100, true, 1)`,
				[TEST_WITH_THRESHOLD, USER]
			),
			rejectedWith('23514', 'test_attempts_review_projection_check')
		)
	})

	test.each([
		['answers', `'{}'::jsonb`],
		['results', `'[{"questionId":"q1"}]'::jsonb`],
		['results_version', '2'],
		['earned_points', 'earned_points + 1'],
		['total_points', 'total_points + 1'],
		['score_percentage', 'score_percentage + 1'],
		['passed', 'NOT passed'],
	])('UPDATE of the fact column %s is rejected by test_attempts_facts_immutable with 23001', async (column, value) => {
		await assert.rejects(
			db().query(`UPDATE test_attempts SET ${column} = ${value} WHERE id = $1`, [ATTEMPT_HALF]),
			rejectedWith('23001', 'test_attempts_facts_immutable')
		)
	})

	test('UPDATE of session_id and of projection columns passes the trigger', async () => {
		await db().query('UPDATE test_attempts SET session_id = NULL WHERE id = $1', [ATTEMPT_ZERO])
		assert.equal(await sessionOf(ATTEMPT_ZERO), null)
		const updated = await db().query('UPDATE test_attempts SET final_score_percentage = 55 WHERE id = $1', [
			ATTEMPT_HALF,
		])
		assert.equal(updated.rowCount, 1)
	})

	test('open is seeded inactive with the manual metric', async () => {
		const { rows } = await db().query<{
			is_active: boolean
			is_system: boolean
			ui_template: string
			metric: string
			points: number
		}>(
			`SELECT is_active, is_system, ui_template, scoring_rule->>'mistakeMetric' AS metric, (scoring_rule->>'correctPoints')::int AS points
			FROM question_types WHERE key = 'open'`
		)
		assert.deepEqual(rows, [{ is_active: false, is_system: true, ui_template: 'open', metric: 'manual', points: 3 }])
	})

	test('running the seed again keeps an enabled open type enabled', async () => {
		await db().query("UPDATE question_types SET is_active = true WHERE key = 'open'")
		const result = await db().query(seedStatement())
		assert.equal(result.rowCount, 0)
		const { rows } = await db().query<{ is_active: boolean }>("SELECT is_active FROM question_types WHERE key = 'open'")
		assert.deepEqual(rows, [{ is_active: true }])
	})

	test('deleting a session sets session_id of its attempt to NULL through the trigger', async () => {
		assert.equal(await sessionOf(ATTEMPT_FULL), SESSION_ONE)
		await db().query('DELETE FROM test_sessions WHERE id = $1', [SESSION_ONE])
		assert.equal(await sessionOf(ATTEMPT_FULL), null)
	})

	test('deleting a test removes its attempts', async () => {
		await db().query('DELETE FROM tests WHERE id = $1', [TEST_WITHOUT_THRESHOLD])
		const { rows } = await db().query<{ count: number }>(
			'SELECT count(*)::int AS count FROM test_attempts WHERE test_id = $1',
			[TEST_WITHOUT_THRESHOLD]
		)
		assert.equal(rows[0]?.count, 0)
	})

	test('users_created_by_fk deletes with SET NULL', async () => {
		const { rows } = await db().query<{ confdeltype: string }>(
			"SELECT confdeltype FROM pg_constraint WHERE conname = 'users_created_by_fk'"
		)
		assert.deepEqual(rows, [{ confdeltype: 'n' }])
	})
})
