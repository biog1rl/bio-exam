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

const TOPIC = '61000000-0000-4000-8000-000000000001'
const TEST = '62000000-0000-4000-8000-000000000002'
const QUESTION_ONE = '63000000-0000-4000-8000-000000000003'
const QUESTION_TWO = '64000000-0000-4000-8000-000000000004'

let scratch: ScratchDatabase | null = null
let fresh: ScratchDatabase | null = null
let pool: Pool | null = null
let copyDir: string | null = null

function db(): Pool {
	assert.ok(pool)
	return pool
}

function readJournal(folder: string): { entries: JournalEntry[] } {
	return JSON.parse(fs.readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8')) as { entries: JournalEntry[] }
}

function assetRefsEntry(): JournalEntry {
	const entry = readJournal(MIGRATIONS_FOLDER).entries.find((item) => item.tag.endsWith('_question_asset_refs'))
	assert.ok(entry, 'journal has no *_question_asset_refs entry')
	return entry
}

function readManifest(): ManifestEntry[] {
	const manifest = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, 'migrations-manifest.json'), 'utf8')) as {
		migrations: ManifestEntry[]
	}
	return manifest.migrations
}

function prepareMigrationsBefore(target: JournalEntry): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-asset-refs-drizzle-'))
	fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true })
	const journalFile = path.join(dir, 'meta/_journal.json')
	const journal = readJournal(dir)
	const dropped = journal.entries.filter((entry) => entry.idx >= target.idx)
	journal.entries = journal.entries.filter((entry) => entry.idx < target.idx)
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

beforeAll(async () => {
	requireTestDatabaseUrl()
	const target = assetRefsEntry()
	scratch = await createScratchDatabase('test_asset_refs_migration')
	copyDir = prepareMigrationsBefore(target)
	pool = new Pool({ connectionString: scratch.url })
	await migrate(drizzle(pool), { migrationsFolder: copyDir, migrationsSchema: 'public' })
	assert.equal(await migrationCount(), target.idx)

	const table = await db().query("SELECT to_regclass('public.question_asset_refs') AS name")
	assert.equal(table.rows[0]?.name, null)

	await db().query(`INSERT INTO topics (id, slug, title) VALUES ($1, 'refs-topic', 'Refs Topic')`, [TOPIC])
	await db().query(`INSERT INTO tests (id, topic_id, slug, title) VALUES ($1, $2, 'refs-test', 'Refs Test')`, [
		TEST,
		TOPIC,
	])
	await db().query(
		`INSERT INTO questions (id, test_id, type, "order", prompt_path) VALUES ($1, $3, 'radio', 0, 'topics/refs-topic/refs-test/questions/a/prompt.md'), ($2, $3, 'radio', 1, NULL)`,
		[QUESTION_ONE, QUESTION_TWO, TEST]
	)

	await migrateTestDatabase(scratch.url)
}, 120_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
	await fresh?.drop()
	if (copyDir) fs.rmSync(copyDir, { recursive: true, force: true })
})

describe('question_asset_refs migration applied over existing questions', () => {
	test('the real migrator applies only the asset refs migration and records its manifest sha256', async () => {
		const target = assetRefsEntry()
		const manifest = readManifest()
		assert.equal(await migrationCount(), manifest.length)
		assert.equal(manifest.at(-1)?.idx, target.idx)
		const entry = manifest.find((migration) => migration.idx === target.idx)
		assert.ok(entry)
		assert.equal(entry.tag, target.tag)
		assert.equal(entry.when, target.when)
		const file = path.join(MIGRATIONS_FOLDER, entry.file)
		assert.equal(entry.sha256, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'))
		const { rows } = await db().query<{ hash: string }>('SELECT hash FROM __drizzle_migrations WHERE created_at = $1', [
			entry.when,
		])
		assert.equal(rows.length, 1)
		assert.equal(rows[0]?.hash, entry.sha256)
	})

	test('existing questions are marked as not indexed', async () => {
		const { rows } = await db().query<{ id: string; assets_indexed: boolean }>(
			'SELECT id, assets_indexed FROM questions ORDER BY id'
		)
		assert.deepEqual(rows, [
			{ id: QUESTION_ONE, assets_indexed: false },
			{ id: QUESTION_TWO, assets_indexed: false },
		])
	})

	test('question_asset_refs has RLS and the deny_direct_access policy', async () => {
		const rls = await db().query<{ relrowsecurity: boolean }>(
			"SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.question_asset_refs')"
		)
		assert.equal(rls.rows[0]?.relrowsecurity, true)
		const policy = await db().query<{ qual: string; with_check: string; cmd: string }>(
			"SELECT qual, with_check, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'question_asset_refs' AND policyname = 'deny_direct_access'"
		)
		assert.equal(policy.rows.length, 1)
		assert.equal(policy.rows[0]?.cmd, 'ALL')
		assert.equal(policy.rows[0]?.qual, 'false')
		assert.equal(policy.rows[0]?.with_check, 'false')
	})

	test('a pair is unique and deleting the question removes its refs', async () => {
		await db().query(
			`INSERT INTO question_asset_refs (question_id, asset_key) VALUES ($1, 'images/a.webp'), ($1, 'images/b.webp'), ($2, 'images/a.webp')`,
			[QUESTION_ONE, QUESTION_TWO]
		)
		await assert.rejects(
			db().query(`INSERT INTO question_asset_refs (question_id, asset_key) VALUES ($1, 'images/a.webp')`, [
				QUESTION_ONE,
			]),
			(error: unknown) => (error as { code?: string }).code === '23505'
		)
		await db().query('DELETE FROM questions WHERE id = $1', [QUESTION_ONE])
		const { rows } = await db().query<{ question_id: string; asset_key: string }>(
			'SELECT question_id, asset_key FROM question_asset_refs ORDER BY question_id, asset_key'
		)
		assert.deepEqual(rows, [{ question_id: QUESTION_TWO, asset_key: 'images/a.webp' }])
	})

	test('a fresh database after the full chain has a complete index', async () => {
		fresh = await createScratchDatabase('test_asset_refs_migration_fresh')
		await migrateTestDatabase(fresh.url)
		const freshPool = new Pool({ connectionString: fresh.url })
		try {
			const { rows } = await freshPool.query<{ count: string }>(
				'SELECT count(*)::text AS count FROM questions WHERE NOT assets_indexed'
			)
			assert.equal(Number(rows[0]?.count), 0)
		} finally {
			await freshPool.end()
		}
	}, 120_000)
})
