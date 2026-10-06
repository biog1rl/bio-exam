import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { resolveChartConfigs } from '../lib/charts/config.js'
import {
	createScratchDatabase,
	migrateTestDatabase,
	requireTestDatabaseUrl,
	type ScratchDatabase,
} from '../test-support/test-database.js'

type JournalEntry = { idx: number; tag: string; when: number }

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

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

function chartSettingsEntry(): JournalEntry {
	const entry = readJournal(MIGRATIONS_FOLDER).entries.find((item) => item.tag.endsWith('_chart_settings'))
	assert.ok(entry, 'journal has no *_chart_settings entry')
	return entry
}

function prepareMigrationsBefore(target: JournalEntry): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-chart-settings-drizzle-'))
	fs.cpSync(MIGRATIONS_FOLDER, dir, { recursive: true })
	const journal = readJournal(dir)
	const dropped = journal.entries.filter((entry) => entry.idx >= target.idx)
	journal.entries = journal.entries.filter((entry) => entry.idx < target.idx)
	fs.writeFileSync(path.join(dir, 'meta/_journal.json'), JSON.stringify(journal, null, 2))
	for (const entry of dropped) {
		fs.rmSync(path.join(dir, `${entry.tag}.sql`), { force: true })
		fs.rmSync(path.join(dir, `meta/${entry.tag.slice(0, 4)}_snapshot.json`), { force: true })
	}
	return dir
}

beforeAll(async () => {
	requireTestDatabaseUrl()
	scratch = await createScratchDatabase('test_chart_settings_migration')
	copyDir = prepareMigrationsBefore(chartSettingsEntry())
	pool = new Pool({ connectionString: scratch.url })
	await migrate(drizzle(pool), { migrationsFolder: copyDir, migrationsSchema: 'public' })
	await db().query(`UPDATE app_settings SET value = 'week' WHERE key = 'chart_default_range'`)
	await migrateTestDatabase(scratch.url)
}, 120_000)

afterAll(async () => {
	await pool?.end()
	await scratch?.drop()
	if (copyDir) fs.rmSync(copyDir, { recursive: true, force: true })
})

describe('chart_settings migration over an existing chart range', () => {
	test('the saved range becomes the period of the test results chart, other settings stay default', async () => {
		const { rows } = await db().query<{ id: string; configs: unknown }>('SELECT id, configs FROM chart_settings')
		assert.equal(rows.length, 1)
		assert.equal(rows[0]?.id, 'global')
		assert.deepEqual(rows[0]?.configs, { testResults: { period: 'week' } })
		const resolved = resolveChartConfigs(rows[0]?.configs)
		assert.equal(resolved.testResults.period, 'week')
		assert.equal(resolved.testResults.type, 'area')
	})

	test('app_settings is dropped', async () => {
		const { rows } = await db().query("SELECT to_regclass('public.app_settings') AS name")
		assert.equal(rows[0]?.name, null)
	})

	test('chart_settings has RLS and the deny_direct_access policy', async () => {
		const rls = await db().query<{ relrowsecurity: boolean }>(
			"SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.chart_settings')"
		)
		assert.equal(rls.rows[0]?.relrowsecurity, true)
		const policy = await db().query(
			"SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chart_settings' AND policyname = 'deny_direct_access'"
		)
		assert.equal(policy.rows.length, 1)
	})
})
