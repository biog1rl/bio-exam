import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, test, vi } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import { createScratchDatabase, migrateTestDatabase, type ScratchDatabase } from '../../test-support/test-database.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type Json = Record<string, unknown>

type AssetIndexModule = typeof import('./asset-index.js')

type MarkerRow = { assets_indexed: boolean; prompt_path: string | null }

const run = promisify(execFile)

const SERVER_DIR = fileURLToPath(new URL('../../..', import.meta.url))
const SEED_FILE = fileURLToPath(new URL('../../../../../e2e/fixtures/seed.json', import.meta.url))
const PASSWORD = 'asset-index-password-1'
const TOPIC_SLUG = 'asset-index-topic'
const FAIL_KEY = 'images/zz-fail.webp'
const REVISION_PROMPT = /\/prompt-[0-9a-f]{12}\.md$/

const OPTIONS = [
	{ id: 'a', text: 'Клетка' },
	{ id: 'b', text: 'Ткань' },
]

let ctx: AuthApp
let mem: MemoryStorageAdapter
let adminJar: CookieJar
let ai: AssetIndexModule
let topicId = ''
let slugCounter = 0

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'a', points: 1, ...overrides }
}

function nextSlug(name: string): string {
	slugCounter += 1
	return `asset-index-${name}-${slugCounter}`
}

async function saveTest(slug: string, questions: Json[]): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return (reply.body.test as Json).id as string
}

async function postQuestion(testId: string, body: Json) {
	return call(ctx, 'POST', `/api/tests/${testId}/questions`, { cookies: adminJar, body })
}

async function patchQuestion(testId: string, questionId: string, body: Json) {
	return call(ctx, 'PATCH', `/api/tests/${testId}/questions/${questionId}`, { cookies: adminJar, body })
}

async function refsOf(questionId: string): Promise<string[]> {
	const { rows } = await ctx.pgPool.query<{ asset_key: string }>(
		'SELECT asset_key FROM question_asset_refs WHERE question_id = $1 ORDER BY asset_key',
		[questionId]
	)
	return rows.map((row) => row.asset_key)
}

async function markerOf(questionId: string): Promise<MarkerRow | undefined> {
	const { rows } = await ctx.pgPool.query<MarkerRow>(
		'SELECT assets_indexed, prompt_path FROM questions WHERE id = $1',
		[questionId]
	)
	return rows[0]
}

async function questionIds(testId: string): Promise<string[]> {
	const { rows } = await ctx.pgPool.query<{ id: string }>(
		'SELECT id FROM questions WHERE test_id = $1 ORDER BY "order", id',
		[testId]
	)
	return rows.map((row) => row.id)
}

async function totalRefs(): Promise<number> {
	const { rows } = await ctx.pgPool.query<{ count: string }>('SELECT count(*)::text AS count FROM question_asset_refs')
	return Number(rows[0]?.count)
}

async function withFailingRefInsert(action: () => Promise<void>): Promise<void> {
	await ctx.pgPool.query(
		`CREATE OR REPLACE FUNCTION asset_index_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'asset index failure'; END $$ LANGUAGE plpgsql`
	)
	await ctx.pgPool.query(
		`CREATE TRIGGER asset_index_fail AFTER INSERT ON question_asset_refs FOR EACH ROW WHEN (NEW.asset_key = '${FAIL_KEY}') EXECUTE FUNCTION asset_index_fail()`
	)
	try {
		await action()
	} finally {
		await ctx.pgPool.query('DROP TRIGGER IF EXISTS asset_index_fail ON question_asset_refs')
	}
}

beforeAll(async () => {
	ctx = await startAuthApp('test_asset_index')
	await seedUser(ctx, { login: 'asset_index_admin', roles: ['admin'], password: PASSWORD })
	const admin = await login(ctx, 'asset_index_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	mem = await memoryStorage()
	ai = await import('./asset-index.js')
	const topic = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug: TOPIC_SLUG, title: 'Тема индекса ссылок' },
	})
	assert.equal(topic.status, 201)
	topicId = (topic.body.topic as Json).id as string
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('индекс ссылок в транзакции записи (D-17)', () => {
	test('tracer: создание вопроса с картинкой в промпте и в пояснении пишет обе ссылки и маркер', async () => {
		const testId = await saveTest(nextSlug('create'), [radio('Вопрос без картинки', { order: 0 })])
		const reply = await postQuestion(
			testId,
			radio('Что на рисунке?\n\n![](images/a.webp)', {
				explanationText: 'Подсказка <img src="/uploads/images/b.webp">',
			})
		)
		assert.equal(reply.status, 201, JSON.stringify(reply.body))
		const questionId = reply.body.questionId as string
		assert.deepEqual(await refsOf(questionId), ['images/a.webp', 'images/b.webp'])
		assert.equal((await markerOf(questionId))?.assets_indexed, true)
	})

	test('правка без картинок убирает ссылки, маркер остаётся true', async () => {
		const testId = await saveTest(nextSlug('update'), [radio('![](images/a.webp)', { order: 0 })])
		const [questionId] = await questionIds(testId)
		assert.ok(questionId)
		assert.deepEqual(await refsOf(questionId), ['images/a.webp'])
		const reply = await patchQuestion(testId, questionId, radio('Текст без картинок'))
		assert.equal(reply.status, 200, JSON.stringify(reply.body))
		assert.deepEqual(await refsOf(questionId), [])
		assert.equal((await markerOf(questionId))?.assets_indexed, true)
	})

	test('сохранение теста целиком индексирует каждый вопрос', async () => {
		const testId = await saveTest(nextSlug('save'), [
			radio('![](images/s1.webp)', { order: 0 }),
			radio('<img src="images/s2.webp">', { order: 1, explanationText: '![](images/s3.webp)' }),
		])
		const [first, second] = await questionIds(testId)
		assert.ok(first && second)
		assert.deepEqual(await refsOf(first), ['images/s1.webp'])
		assert.deepEqual(await refsOf(second), ['images/s2.webp', 'images/s3.webp'])
		assert.equal((await markerOf(first))?.assets_indexed, true)
		assert.equal((await markerOf(second))?.assets_indexed, true)
	})

	test('сбой транзакции правки: ссылки, маркер и указатель прежние', async () => {
		const testId = await saveTest(nextSlug('fail-update'), [radio('![](images/a.webp)', { order: 0 })])
		const [questionId] = await questionIds(testId)
		assert.ok(questionId)
		const before = await markerOf(questionId)
		await withFailingRefInsert(async () => {
			const reply = await patchQuestion(testId, questionId, radio(`![](images/c.webp) ![](${FAIL_KEY})`))
			assert.equal(reply.status, 500)
		})
		assert.deepEqual(await refsOf(questionId), ['images/a.webp'])
		assert.deepEqual(await markerOf(questionId), before)

		await ctx.pgPool.query('UPDATE questions SET assets_indexed = false WHERE id = $1', [questionId])
		try {
			await withFailingRefInsert(async () => {
				const reply = await patchQuestion(testId, questionId, radio(`![](${FAIL_KEY})`))
				assert.equal(reply.status, 500)
			})
			assert.equal((await markerOf(questionId))?.assets_indexed, false)
			assert.deepEqual(await refsOf(questionId), ['images/a.webp'])
		} finally {
			await ctx.pgPool.query('UPDATE questions SET assets_indexed = true WHERE id = $1', [questionId])
		}
	})

	test('сбой транзакции создания: вопроса и строк индекса нет', async () => {
		const testId = await saveTest(nextSlug('fail-create'), [radio('Без картинки', { order: 0 })])
		const idsBefore = await questionIds(testId)
		const refsBefore = await totalRefs()
		await withFailingRefInsert(async () => {
			const reply = await postQuestion(testId, radio(`![](images/d.webp) ![](${FAIL_KEY})`))
			assert.equal(reply.status, 500)
		})
		assert.deepEqual(await questionIds(testId), idsBefore)
		assert.equal(await totalRefs(), refsBefore)
	})
})

async function markers(): Promise<Array<{ id: string; assets_indexed: boolean }>> {
	const { rows } = await ctx.pgPool.query<{ id: string; assets_indexed: boolean }>(
		'SELECT id, assets_indexed FROM questions ORDER BY id'
	)
	return rows
}

async function allRefs(): Promise<Array<{ question_id: string; asset_key: string }>> {
	const { rows } = await ctx.pgPool.query<{ question_id: string; asset_key: string }>(
		'SELECT question_id, asset_key FROM question_asset_refs ORDER BY question_id, asset_key'
	)
	return rows
}

async function insertUnindexed(testId: string, promptPath: string | null): Promise<string> {
	const { rows } = await ctx.pgPool.query<{ id: string }>(
		`INSERT INTO questions (test_id, type, "order", prompt_path) VALUES ($1, 'radio', 99, $2) RETURNING id`,
		[testId, promptPath]
	)
	const id = rows[0]?.id
	assert.ok(id)
	return id
}

describe('удаление картинки и сохранение вопроса с ней сериализуются по ключу (CR-02)', () => {
	let side: Pool

	beforeAll(() => {
		side = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 })
	})

	afterAll(async () => {
		await side?.end()
	})

	async function advisoryWaiters(): Promise<number> {
		const { rows } = await side.query<{ count: string }>(
			`SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`
		)
		return Number(rows[0]?.count)
	}

	async function waitForWaiters(expected: number): Promise<boolean> {
		for (let attempt = 0; attempt < 250; attempt += 1) {
			if ((await advisoryWaiters()) >= expected) return true
			await new Promise((resolve) => setTimeout(resolve, 20))
		}
		return false
	}

	function imageKey(name: string): string {
		return `images/asset-lock-${name}-${slugCounter}.webp`
	}

	test('сохранение первым: удаление ждёт его commit и отвечает 409, вопрос со ссылкой сохранён, картинка на месте', async () => {
		const testId = await saveTest(nextSlug('lock-save'), [radio('Без картинки', { order: 0 })])
		const [questionId] = await questionIds(testId)
		assert.ok(questionId)
		const key = imageKey('save-first')
		mem.put(key, 'webp', 'image/webp')
		const holder = await side.connect()
		let save: ReturnType<typeof patchQuestion> | null = null
		let remove: ReturnType<typeof call> | null = null
		let saveWaited = false
		let deleteWaited = false
		try {
			await holder.query('BEGIN')
			await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key])
			save = patchQuestion(testId, questionId, radio(`С картинкой ![](${key})`, { order: 0 }))
			saveWaited = await waitForWaiters(1)
			remove = call(ctx, 'DELETE', '/api/docs/assets', { cookies: adminJar, body: { path: key } })
			deleteWaited = await waitForWaiters(2)
		} finally {
			await holder.query('COMMIT')
			holder.release()
		}
		const [saved, deleted] = await Promise.all([save, remove])
		assert.equal(saveWaited, true)
		assert.equal(deleteWaited, true)
		assert.equal(saved?.status, 200, JSON.stringify(saved?.body))
		assert.equal(deleted?.status, 409, JSON.stringify(deleted?.body))
		assert.ok(mem.get(key))
		assert.deepEqual(await refsOf(questionId), [key])
	})

	test('удаление первым: сохранение вопроса ждёт, пока удаление держит ключ', async () => {
		const testId = await saveTest(nextSlug('lock-delete'), [radio('Без картинки', { order: 0 })])
		const [questionId] = await questionIds(testId)
		assert.ok(questionId)
		const key = imageKey('delete-first')
		mem.put(key, 'webp', 'image/webp')
		const original = mem.remove.bind(mem)
		const pending: Array<ReturnType<typeof patchQuestion>> = []
		let saveWaited = false
		const spy = vi.spyOn(mem, 'remove').mockImplementation(async (keys: string[]) => {
			if (pending.length === 0 && keys.includes(key)) {
				pending.push(patchQuestion(testId, questionId, radio(`С картинкой ![](${key})`, { order: 0 })))
				saveWaited = await waitForWaiters(1)
			}
			return original(keys)
		})
		try {
			const deleted = await call(ctx, 'DELETE', '/api/docs/assets', { cookies: adminJar, body: { path: key } })
			assert.equal(deleted.status, 200, JSON.stringify(deleted.body))
			assert.equal(pending.length, 1)
			const saved = await pending[0]
			assert.equal(saveWaited, true)
			assert.equal(saved?.status, 200, JSON.stringify(saved?.body))
			assert.equal(mem.get(key), null)
		} finally {
			spy.mockRestore()
		}
	})
})

describe('инвентаризация и бэкфилл индекса (D-17, D-19)', () => {
	test('инвентаризация считает формы, пространства, nonServable и отсутствующие объекты и ничего не пишет', async () => {
		mem.put('images/inv-a.webp', 'a', 'image/webp')
		const testId = await saveTest(nextSlug('inventory'), [
			radio(
				[
					'![](images/inv-a.webp)',
					'![](images/logo.svg)',
					'<img src="/uploads/tests/inv/t/assets/c.png">',
					'![](https://example.com/x.png)',
					'![](/api/docs/assets/proxy?path=topics%2Finv%2Ft%2Fquestions%2Fq%2Fimg.png)',
					'![](avatars/u/p.png)',
					'![](../x.png)',
				].join('\n'),
				{ order: 0, explanationText: '![](uploads/images/inv-b.webp)' }
			),
		])
		const [questionId] = await questionIds(testId)
		assert.ok(questionId)
		const gone = await insertUnindexed(testId, `topics/${TOPIC_SLUG}/gone/questions/x/prompt-000000000000.md`)
		try {
			const markersBefore = await markers()
			const refsBefore = await allRefs()
			const inventory = await ai.inventoryAssetRefs()
			assert.deepEqual(await markers(), markersBefore)
			assert.deepEqual(await allRefs(), refsBefore)

			const own = <T extends { questionId: string }>(list: T[]) => list.filter((item) => item.questionId === questionId)
			const forms = own(inventory.links).map((link) => link.form)
			assert.deepEqual(forms.sort(), [
				'external',
				'invalid',
				'key',
				'key',
				'key',
				'proxy-url',
				'uploads-images',
				'uploads-tests',
			])
			for (const form of ['key', 'proxy-url', 'uploads-images', 'uploads-tests', 'external', 'invalid'] as const) {
				assert.ok(inventory.byForm[form] >= forms.filter((value) => value === form).length, form)
			}
			assert.ok(inventory.byNamespace.images >= 3)
			assert.ok(inventory.byNamespace.topics >= 2)
			assert.ok(inventory.byNamespace.avatars >= 1)
			assert.deepEqual(
				own(inventory.outsideNamespaces).map((entry) => entry.key),
				['topics/inv/t/questions/q/img.png']
			)
			assert.deepEqual(
				own(inventory.nonServable)
					.map((entry) => entry.key)
					.sort(),
				['images/logo.svg', 'topics/inv/t/questions/q/img.png']
			)
			assert.ok(!inventory.nonServable.some((entry) => entry.key === 'images/inv-a.webp'))
			assert.deepEqual(
				own(inventory.missingObjects)
					.map((entry) => entry.key)
					.sort(),
				[
					'avatars/u/p.png',
					'images/inv-b.webp',
					'images/logo.svg',
					'topics/inv/t/assets/c.png',
					'topics/inv/t/questions/q/img.png',
				]
			)
			assert.deepEqual(
				inventory.missingPointers.filter((entry) => entry.questionId === gone),
				[{ questionId: gone, kind: 'prompt', key: `topics/${TOPIC_SLUG}/gone/questions/x/prompt-000000000000.md` }]
			)
			assert.ok(inventory.questions >= 2)
		} finally {
			await ctx.pgPool.query('DELETE FROM questions WHERE id = $1', [gone])
		}
	})

	test('бэкфилл индексирует вопросы с маркером false и не трогает проиндексированные', async () => {
		const slug = nextSlug('backfill')
		const testId = await saveTest(slug, [radio('![](images/bf-indexed.webp)', { order: 0 })])
		const [indexed] = await questionIds(testId)
		assert.ok(indexed)
		await ctx.pgPool.query('DELETE FROM question_asset_refs WHERE question_id = $1', [indexed])
		const promptPath = `topics/${TOPIC_SLUG}/${slug}/questions/raw/prompt.md`
		mem.put(promptPath, 'Сырой вопрос ![](images/bf-a.webp) <img src="/uploads/images/bf-b.webp">', 'text/markdown')
		const raw = await insertUnindexed(testId, promptPath)
		assert.equal(await ai.isAssetIndexComplete(), false)

		const result = await ai.backfillAssetRefs()
		assert.ok(result.processed >= 1)
		assert.ok(result.indexed >= 1)
		assert.equal(result.failed, 0)
		assert.deepEqual(await refsOf(raw), ['images/bf-a.webp', 'images/bf-b.webp'])
		assert.equal((await markerOf(raw))?.assets_indexed, true)
		assert.deepEqual(await refsOf(indexed), [])
		assert.equal(await ai.isAssetIndexComplete(), true)

		const again = await ai.backfillAssetRefs()
		assert.deepEqual(again, { processed: 0, indexed: 0, skipped: 0, failed: 0 })
	})
})

describe('сид e2e через модуль содержимого (D-26)', () => {
	let seedDb: ScratchDatabase | null = null
	let storageDir: string | null = null

	afterAll(async () => {
		await seedDb?.drop()
		if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true })
	})

	test('у всех вопросов сида маркер true, указатель промпта — ключ ревизии, объекты промптов существуют', async () => {
		seedDb = await createScratchDatabase('test_asset_index_seed')
		await migrateTestDatabase(seedDb.url)
		storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bio-exam-asset-index-seed-'))
		const { stdout } = await run('yarn', ['tsx', 'src/scripts/e2e-seed.ts'], {
			cwd: SERVER_DIR,
			env: {
				...process.env,
				BIO_EXAM_ISOLATED_ENV: '1',
				TEST_DATABASE_URL: seedDb.url,
				STORAGE_DRIVER: 'local',
				STORAGE_LOCAL_DIR: storageDir,
				E2E_SEED_FILE: SEED_FILE,
			},
		})
		const summary = /e2e-seed: users=(\d+) tests=(\d+) questions=(\d+) prompts=(\d+)/.exec(stdout)
		assert.ok(summary, stdout)
		assert.equal(summary[3], summary[4])

		const pool = new Pool({ connectionString: seedDb.url })
		try {
			const { rows } = await pool.query<MarkerRow>('SELECT assets_indexed, prompt_path FROM questions')
			assert.equal(rows.length, Number(summary[3]))
			assert.ok(rows.length > 0)
			for (const row of rows) {
				assert.equal(row.assets_indexed, true)
				assert.ok(row.prompt_path && REVISION_PROMPT.test(row.prompt_path), String(row.prompt_path))
				assert.ok(fs.existsSync(path.join(storageDir, row.prompt_path)), row.prompt_path)
			}
			const documents = await pool.query<{ count: string }>(
				'SELECT count(*)::text AS count FROM question_search_documents'
			)
			assert.equal(Number(documents.rows[0]?.count), rows.length)
		} finally {
			await pool.end()
		}
	}, 120_000)
})
