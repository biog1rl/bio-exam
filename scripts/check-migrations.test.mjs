/**
 * Тесты этапов scripts/check-migrations.mjs без базы: манифест, generate-no-diff, drizzle-check.
 *
 * Каждый тест работает на временной копии app/server/drizzle (префикс bio-exam-drizzle-fixture-),
 * копия удаляется после теста. Настоящий app/server/drizzle не меняется (проверяется в конце).
 * Запуск: node --test scripts/check-migrations.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkDrizzleCheck, checkGenerateNoDiff, checkManifest } from './check-migrations.mjs'

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url))
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'app/server/drizzle')
const FIXTURE_PREFIX = 'bio-exam-drizzle-fixture-'
const STOP_MESSAGE = 'STOP (plan 009): generated diff proposes destructive statements'

const repoStatusBefore = migrationsStatus()

function migrationsStatus() {
	return execFileSync('git', ['status', '--porcelain', 'app/server/drizzle'], { cwd: REPO_ROOT, encoding: 'utf8' })
}

/** Копия app/server/drizzle во временный каталог; mutate(dir) портит её под конкретный случай */
async function fixture(t, mutate = async () => {}) {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), FIXTURE_PREFIX))
	t.after(() => fsp.rm(dir, { recursive: true, force: true }))
	await fsp.cp(MIGRATIONS_DIR, dir, { recursive: true })
	await mutate(dir)
	return dir
}

async function readJson(file) {
	return JSON.parse(await fsp.readFile(file, 'utf8'))
}

async function writeJson(file, value) {
	await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

function joined(result) {
	return result.lines.join('\n')
}

after(() => {
	assert.equal(migrationsStatus(), repoStatusBefore, 'tests must not change app/server/drizzle')
})

test('manifest: the repository folder matches its manifest', async () => {
	const result = await checkManifest(MIGRATIONS_DIR)
	assert.equal(result.ok, true, joined(result))
})

test('manifest: one changed byte in an applied migration fails and names the file', async (t) => {
	const dir = await fixture(t, async (d) => {
		const file = path.join(d, '0005_show_correct_answer.sql')
		const bytes = await fsp.readFile(file)
		bytes[0] = bytes[0] === 0x20 ? 0x21 : 0x20
		await fsp.writeFile(file, bytes)
	})
	const result = await checkManifest(dir)
	assert.equal(result.ok, false)
	assert.match(joined(result), /0005_show_correct_answer\.sql/)
	assert.match(joined(result), /sha256/)
})

test('manifest: an extra unjournaled migration fails and names the file', async (t) => {
	const dir = await fixture(t, (d) => fsp.writeFile(path.join(d, '0021_x.sql'), 'SELECT 1;\n'))
	const result = await checkManifest(dir)
	assert.equal(result.ok, false)
	assert.match(joined(result), /0021_x\.sql/)
})

test('manifest: two swapped journal entries fail', async (t) => {
	const dir = await fixture(t, async (d) => {
		const file = path.join(d, 'meta/_journal.json')
		const journal = await readJson(file)
		const [a, b] = [journal.entries[5], journal.entries[6]]
		journal.entries[5] = b
		journal.entries[6] = a
		await writeJson(file, journal)
	})
	const result = await checkManifest(dir)
	assert.equal(result.ok, false)
	assert.match(joined(result), /0005_show_correct_answer|0006_scoring_rules/)
})

test('manifest: a missing migration file fails and names the file', async (t) => {
	const dir = await fixture(t, (d) => fsp.rm(path.join(d, '0007_global_scoring_settings.sql')))
	const result = await checkManifest(dir)
	assert.equal(result.ok, false)
	assert.match(joined(result), /0007_global_scoring_settings\.sql/)
})

test('manifest: a renamed migration file fails', async (t) => {
	const dir = await fixture(t, (d) =>
		fsp.rename(path.join(d, '0003_refresh_tokens.sql'), path.join(d, '0003_refresh_tokens_renamed.sql'))
	)
	const result = await checkManifest(dir)
	assert.equal(result.ok, false)
	assert.match(joined(result), /0003_refresh_tokens\.sql/)
	assert.match(joined(result), /0003_refresh_tokens_renamed\.sql/)
})

test('generate-no-diff: the restored snapshot produces no new file', async (t) => {
	const dir = await fixture(t)
	const result = await checkGenerateNoDiff(dir)
	assert.equal(result.ok, true, joined(result))
})

test('generate-no-diff: without meta/0020_snapshot.json the destructive diff stops the check', async (t) => {
	const dir = await fixture(t, (d) => fsp.rm(path.join(d, 'meta/0020_snapshot.json')))
	const before = (await fsp.readdir(dir)).sort()
	const result = await checkGenerateNoDiff(dir)
	assert.equal(result.ok, false)
	assert.equal(result.destructive, true)
	assert.match(joined(result), new RegExp(STOP_MESSAGE.replace(/[()]/g, '\\$&')))
	assert.match(joined(result), /\bDROP\b/)
	// Этап генерирует в собственную копию: переданный каталог не меняется
	assert.deepEqual((await fsp.readdir(dir)).sort(), before)
})

test('drizzle-check: the repository folder passes', async (t) => {
	const dir = await fixture(t)
	const result = await checkDrizzleCheck(dir)
	assert.equal(result.ok, true, joined(result))
})

test('drizzle-check: two snapshots with the same parent fail', async (t) => {
	const dir = await fixture(t, async (d) => {
		const snapshot = await readJson(path.join(d, 'meta/0020_snapshot.json'))
		snapshot.id = '00000000-0000-4000-8000-000000000019'
		await writeJson(path.join(d, 'meta/0019_snapshot.json'), snapshot)
	})
	const result = await checkDrizzleCheck(dir)
	assert.equal(result.ok, false)
	assert.match(joined(result), /collision/)
})
