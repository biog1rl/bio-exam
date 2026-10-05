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

const ADMIN = '71000000-0000-4000-8000-000000000001'
const TEACHER = '72000000-0000-4000-8000-000000000002'
const ASSIGNER = '73000000-0000-4000-8000-000000000003'
const OWNER = '74000000-0000-4000-8000-000000000004'
const TOPIC_KEPT = '75000000-0000-4000-8000-000000000005'
const TOPIC_REMOVED = '76000000-0000-4000-8000-000000000006'
const GROUP = '77000000-0000-4000-8000-000000000007'
const OWNED_GROUP = '78000000-0000-4000-8000-000000000008'

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

function teacherZonesEntry(): JournalEntry {
	const entry = readJournal(MIGRATIONS_FOLDER).entries.find((item) => item.tag.endsWith('_teacher_zones'))
	assert.ok(entry, 'journal has no *_teacher_zones entry')
	return entry
}

function readManifest(): ManifestEntry[] {
	const manifest = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, 'migrations-manifest.json'), 'utf8')) as {
		migrations: ManifestEntry[]
	}
	return manifest.migrations
}

function prepareMigrationsBefore(target: JournalEntry): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-teacher-zones-drizzle-'))
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

async function teacherTopicRows(): Promise<
	Array<{ teacher_id: string; topic_id: string; assigned_by: string | null }>
> {
	const { rows } = await db().query<{ teacher_id: string; topic_id: string; assigned_by: string | null }>(
		'SELECT teacher_id, topic_id, assigned_by FROM teacher_topics ORDER BY teacher_id, topic_id'
	)
	return rows
}

beforeAll(async () => {
	requireTestDatabaseUrl()
	const target = teacherZonesEntry()
	scratch = await createScratchDatabase('test_teacher_zone_migration')
	copyDir = prepareMigrationsBefore(target)
	pool = new Pool({ connectionString: scratch.url })
	await migrate(drizzle(pool), { migrationsFolder: copyDir, migrationsSchema: 'public' })
	assert.equal(await migrationCount(), target.idx)

	const table = await db().query("SELECT to_regclass('public.teacher_topics') AS name")
	assert.equal(table.rows[0]?.name, null)

	await db().query(`INSERT INTO roles (key) VALUES ('admin') ON CONFLICT DO NOTHING`)
	await db().query(
		`INSERT INTO users (id, login, is_active) VALUES ($1, 'zone-admin', true), ($2, 'zone-teacher', true), ($3, 'zone-assigner', true), ($4, 'zone-owner', true)`,
		[ADMIN, TEACHER, ASSIGNER, OWNER]
	)
	await db().query(`INSERT INTO user_roles (user_id, role_key) VALUES ($1, 'admin')`, [ADMIN])
	await db().query(
		`INSERT INTO topics (id, slug, title) VALUES ($1, 'zone-kept', 'Zone Kept'), ($2, 'zone-removed', 'Zone Removed')`,
		[TOPIC_KEPT, TOPIC_REMOVED]
	)
	await db().query(`INSERT INTO student_groups (id, name, created_by) VALUES ($1, 'Zone Group', $2)`, [GROUP, ADMIN])
	await db().query(`INSERT INTO user_groups (group_id, user_id) VALUES ($1, $2)`, [GROUP, TEACHER])

	await migrateTestDatabase(scratch.url)
}, 120_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
	if (copyDir) fs.rmSync(copyDir, { recursive: true, force: true })
})

describe('teacher_zones migration applied over existing data', { shuffle: false }, () => {
	test('the real migrator applies only the teacher zones migration and records its manifest sha256', async () => {
		const target = teacherZonesEntry()
		const manifest = readManifest()
		assert.equal(await migrationCount(), manifest.length)
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

	test('existing data is untouched: group without owner, no zone rows, teacher role row added', async () => {
		const groups = await db().query<{ id: string; name: string; created_by: string; owner_id: string | null }>(
			'SELECT id, name, created_by, owner_id FROM student_groups ORDER BY id'
		)
		assert.deepEqual(groups.rows, [{ id: GROUP, name: 'Zone Group', created_by: ADMIN, owner_id: null }])
		const members = await db().query<{ group_id: string; user_id: string }>(
			'SELECT group_id, user_id FROM user_groups ORDER BY group_id, user_id'
		)
		assert.deepEqual(members.rows, [{ group_id: GROUP, user_id: TEACHER }])
		assert.deepEqual(await teacherTopicRows(), [])
		const roles = await db().query<{ key: string }>('SELECT key FROM roles ORDER BY key')
		assert.deepEqual(
			roles.rows.map((row) => row.key),
			['admin', 'teacher']
		)
		const adminRoles = await db().query<{ role_key: string }>('SELECT role_key FROM user_roles WHERE user_id = $1', [
			ADMIN,
		])
		assert.deepEqual(
			adminRoles.rows.map((row) => row.role_key),
			['admin']
		)
		await db().query(`INSERT INTO user_roles (user_id, role_key) VALUES ($1, 'teacher')`, [TEACHER])
	})

	test('teacher_topics has RLS and the deny_direct_access policy', async () => {
		const rls = await db().query<{ relrowsecurity: boolean }>(
			"SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.teacher_topics')"
		)
		assert.equal(rls.rows[0]?.relrowsecurity, true)
		const policy = await db().query<{ qual: string; with_check: string; cmd: string }>(
			"SELECT qual, with_check, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_topics' AND policyname = 'deny_direct_access'"
		)
		assert.equal(policy.rows.length, 1)
		assert.equal(policy.rows[0]?.cmd, 'ALL')
		assert.equal(policy.rows[0]?.qual, 'false')
		assert.equal(policy.rows[0]?.with_check, 'false')
	})

	test('a teacher and topic pair is unique and assigned_at defaults to now', async () => {
		await db().query(
			`INSERT INTO teacher_topics (teacher_id, topic_id, assigned_by) VALUES ($1, $2, $4), ($1, $3, $4)`,
			[TEACHER, TOPIC_KEPT, TOPIC_REMOVED, ASSIGNER]
		)
		await assert.rejects(
			db().query(`INSERT INTO teacher_topics (teacher_id, topic_id) VALUES ($1, $2)`, [TEACHER, TOPIC_KEPT]),
			(error: unknown) => (error as { code?: string }).code === '23505'
		)
		const { rows } = await db().query<{ fresh: boolean }>(
			"SELECT bool_and(assigned_at > now() - interval '1 minute') AS fresh FROM teacher_topics"
		)
		assert.equal(rows[0]?.fresh, true)
	})

	test('deleting the assigner keeps the row with assigned_by NULL', async () => {
		await db().query('DELETE FROM users WHERE id = $1', [ASSIGNER])
		assert.deepEqual(await teacherTopicRows(), [
			{ teacher_id: TEACHER, topic_id: TOPIC_KEPT, assigned_by: null },
			{ teacher_id: TEACHER, topic_id: TOPIC_REMOVED, assigned_by: null },
		])
	})

	test('deleting a topic removes its zone rows', async () => {
		await db().query('DELETE FROM topics WHERE id = $1', [TOPIC_REMOVED])
		assert.deepEqual(await teacherTopicRows(), [{ teacher_id: TEACHER, topic_id: TOPIC_KEPT, assigned_by: null }])
	})

	test('deleting the group owner sets owner_id to NULL and keeps the group', async () => {
		await db().query(`INSERT INTO student_groups (id, name, created_by, owner_id) VALUES ($1, 'Owned Group', $2, $3)`, [
			OWNED_GROUP,
			ADMIN,
			OWNER,
		])
		const before = await db().query<{ owner_id: string | null }>('SELECT owner_id FROM student_groups WHERE id = $1', [
			OWNED_GROUP,
		])
		assert.equal(before.rows[0]?.owner_id, OWNER)
		await db().query('DELETE FROM users WHERE id = $1', [OWNER])
		const after = await db().query<{ id: string; owner_id: string | null }>(
			'SELECT id, owner_id FROM student_groups WHERE id = $1',
			[OWNED_GROUP]
		)
		assert.deepEqual(after.rows, [{ id: OWNED_GROUP, owner_id: null }])
	})

	test('deleting the teacher removes their zone rows', async () => {
		await db().query('DELETE FROM users WHERE id = $1', [TEACHER])
		assert.deepEqual(await teacherTopicRows(), [])
	})
})
