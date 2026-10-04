import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	call,
	cookieHeader,
	login,
	nextIp,
	seedUser,
	startAuthApp,
	type AuthApp,
	type CookieJar,
} from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import { readZipEntries } from '../../test-support/zip.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type QuestionContentModule = typeof import('./index.js')

type Json = Record<string, unknown>

type QuestionRow = { id: string; order: number }

type Download = { status: number; headers: Headers; buffer: Buffer; entries: Map<string, Buffer> }

const PASSWORD = 'qcon-export-password-1'
const TOO_LARGE = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'
const MISSING_ID = '00000000-0000-4000-8000-000000000000'

const OPTIONS = [
	{ id: 'a', text: 'Хлоропласт' },
	{ id: 'b', text: 'Митохондрия' },
	{ id: 'c', text: 'Рибосома' },
]

let ctx: AuthApp
let mem: MemoryStorageAdapter
let qc: QuestionContentModule
let adminJar: CookieJar
let studentJar: CookieJar
let counter = 0

function radio(promptText: string, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'b', points: 1, ...overrides }
}

function nextSlug(name: string): string {
	counter += 1
	return `qcon-exp-${name}-${counter}`
}

function imageKey(name: string): string {
	return `images/qcon-export-${name}-${randomBytes(6).toString('hex')}.webp`
}

async function createTopic(slug: string): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug, title: `Тема ${slug}` },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return (reply.body.topic as Json).id as string
}

async function saveTest(topicId: string, slug: string, questions: Json[]): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return (reply.body.test as Json).id as string
}

async function questionRows(testId: string): Promise<QuestionRow[]> {
	const { rows } = await ctx.pgPool.query<QuestionRow>(
		'SELECT id, "order" FROM questions WHERE test_id = $1 ORDER BY "order", id',
		[testId]
	)
	return rows
}

async function download(path: string, jar: CookieJar = adminJar): Promise<Download> {
	const response = await fetch(`${ctx.baseUrl}${path}`, {
		headers: { cookie: cookieHeader(jar), 'x-forwarded-for': nextIp() },
	})
	const buffer = Buffer.from(await response.arrayBuffer())
	return {
		status: response.status,
		headers: response.headers,
		buffer,
		entries: response.status === 200 ? readZipEntries(buffer) : new Map(),
	}
}

function text(entries: Map<string, Buffer>, name: string): string {
	const entry = entries.get(name)
	assert.ok(entry, `entry ${name}`)
	return entry.toString('utf8')
}

async function rejection(promise: Promise<unknown>): Promise<{ statusCode?: number; message?: string }> {
	try {
		await promise
	} catch (error) {
		return error as { statusCode?: number; message?: string }
	}
	assert.fail('expected rejection')
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_export')
	await seedUser(ctx, { login: 'qcon_exp_admin', roles: ['admin'], password: PASSWORD })
	await seedUser(ctx, { login: 'qcon_exp_student', roles: ['user'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_exp_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	const student = await login(ctx, 'qcon_exp_student', PASSWORD)
	assert.equal(student.status, 200)
	studentJar = student.jar
	mem = await memoryStorage()
	qc = await import('./index.js')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('ZIP теста', () => {
	test('порядок записей: settings.json, вопросы по порядку, картинки по имени; устаревшая картинка теста под assets/, отсутствующая — в missing-files.txt', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('order')
		const shared = imageKey('b')
		const explained = imageKey('a')
		const legacy = `topics/${topicSlug}/${slug}/assets/c.png`
		const missing = 'images/missing.webp'
		mem.put(shared, randomBytes(32), 'image/webp')
		mem.put(explained, randomBytes(32), 'image/webp')
		mem.put(legacy, randomBytes(32), 'image/png')
		const testId = await saveTest(topicId, slug, [
			radio(`Первый ![схема](${shared} "t")`, {
				order: 0,
				explanationText: `Пояснение <img src="${explained}">`,
			}),
			radio(`Второй <img src="/uploads/tests/${topicSlug}/${slug}/assets/c.png"> ![](${missing})`, { order: 1 }),
		])
		const [first, second] = await questionRows(testId)
		assert.ok(first && second)

		const reply = await download(`/api/tests/${testId}/export`)
		assert.equal(reply.status, 200)
		assert.equal(reply.headers.get('content-disposition'), `attachment; filename="${topicSlug}-${slug}.zip"`)
		assert.deepEqual(
			[...reply.entries.keys()],
			[
				'settings.json',
				`questions/${first.id}/prompt.md`,
				`questions/${first.id}/explanation.md`,
				`questions/${second.id}/prompt.md`,
				'assets/c.png',
				...[explained, shared].sort(),
				'missing-files.txt',
			]
		)
		assert.equal(text(reply.entries, `questions/${first.id}/prompt.md`), `Первый ![схема](${shared} "t")`)
		assert.equal(text(reply.entries, `questions/${first.id}/explanation.md`), `Пояснение <img src="${explained}">`)
		assert.ok(reply.entries.get(shared)?.equals(mem.get(shared)?.data ?? Buffer.alloc(0)))
		assert.ok(reply.entries.get('assets/c.png')?.equals(mem.get(legacy)?.data ?? Buffer.alloc(0)))
		assert.equal(text(reply.entries, 'missing-files.txt'), `${missing}\n`)
	})

	test('settings.json сгенерирован из БД, updatedAt = tests.updated_at; без пропусков missing-files.txt нет', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const slug = nextSlug('settings')
		const testId = await saveTest(topicId, slug, [radio('Без картинок', { order: 0 })])
		const { rows } = await ctx.pgPool.query<{ updated_at: string }>(
			`SELECT to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at FROM tests WHERE id = $1`,
			[testId]
		)
		const updatedAt = rows[0]?.updated_at
		assert.ok(updatedAt)

		const reply = await download(`/api/tests/${testId}/export`)
		assert.equal(reply.status, 200)
		const settings = JSON.parse(text(reply.entries, 'settings.json')) as Json
		assert.deepEqual(Object.keys(settings), [
			'id',
			'title',
			'description',
			'isPublished',
			'showCorrectAnswer',
			'scoringRules',
			'useGlobalScoringRules',
			'timeLimitMinutes',
			'redThresholdMinutes',
			'warningThresholdMinutes',
			'passingScore',
			'version',
			'updatedAt',
		])
		assert.equal(settings.id, testId)
		assert.equal(settings.title, `Тест ${slug}`)
		assert.equal(settings.isPublished, true)
		assert.equal(settings.useGlobalScoringRules, true)
		assert.ok(settings.scoringRules && typeof settings.scoringRules === 'object')
		assert.equal(settings.updatedAt, updatedAt)
		assert.equal(reply.entries.has('missing-files.txt'), false)
		assert.equal(reply.entries.has('answer_keys.json'), false)
	})

	test('withAnswers=true: answer_keys.json после settings.json в порядке вопросов, хранилище не меняется', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('answers')
		const testId = await saveTest(topicId, slug, [
			radio('Ответ c', { order: 0, correct: 'c' }),
			radio('Ответ a', { order: 1, correct: 'a' }),
		])
		const rows = await questionRows(testId)
		mem.put(`topics/${topicSlug}/${slug}/answer_keys.json`, '[{"stale":true}]', 'application/json')
		mem.put(`topics/${topicSlug}/${slug}/settings.json`, '{"stale":true}', 'application/json')
		const before = mem.keys()

		const reply = await download(`/api/tests/${testId}/export?withAnswers=true`)
		assert.equal(reply.status, 200)
		const names = [...reply.entries.keys()]
		assert.deepEqual(names.slice(0, 2), ['settings.json', 'answer_keys.json'])
		assert.deepEqual(JSON.parse(text(reply.entries, 'answer_keys.json')), [
			{ questionId: rows[0]?.id, correct: 'c' },
			{ questionId: rows[1]?.id, correct: 'a' },
		])
		assert.notEqual(text(reply.entries, 'settings.json'), '{"stale":true}')
		assert.deepEqual(mem.keys(), before)
	})

	test('студент: GET /api/tests/<id>/export → 403 Forbidden, и для несуществующего id', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const testId = await saveTest(topicId, nextSlug('student'), [radio('Закрыто', { order: 0 })])
		for (const id of [testId, MISSING_ID]) {
			const reply = await call(ctx, 'GET', `/api/tests/${id}/export`, { cookies: studentJar })
			assert.equal(reply.status, 403)
			assert.equal(reply.body.error, 'Forbidden')
		}
		const absent = await call(ctx, 'GET', `/api/tests/${MISSING_ID}/export`, { cookies: adminJar })
		assert.equal(absent.status, 404)
	})
})

describe('ZIP темы', () => {
	test('тесты по tests.order, затем slug; общая картинка — одна запись images/ в корне; устаревшая картинка теста — <testSlug>/assets/', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const shared = imageKey('shared')
		const first = nextSlug('b')
		const second = nextSlug('a')
		const third = nextSlug('c')
		const legacy = `topics/${topicSlug}/${first}/assets/l.png`
		mem.put(shared, randomBytes(32), 'image/webp')
		mem.put(legacy, randomBytes(32), 'image/png')
		const firstId = await saveTest(topicId, first, [
			radio(`Первый ![](${shared}) <img src="/uploads/tests/${topicSlug}/${first}/assets/l.png">`, { order: 0 }),
		])
		const secondId = await saveTest(topicId, second, [radio(`Второй ![](${shared})`, { order: 0 })])
		const thirdId = await saveTest(topicId, third, [radio('Третий', { order: 0 })])
		await ctx.pgPool.query('UPDATE tests SET "order" = $2 WHERE id = $1', [firstId, 0])
		await ctx.pgPool.query('UPDATE tests SET "order" = $2 WHERE id = $1', [secondId, 1])
		await ctx.pgPool.query('UPDATE tests SET "order" = $2 WHERE id = $1', [thirdId, 1])
		const [q1] = await questionRows(firstId)
		const [q2] = await questionRows(secondId)
		const [q3] = await questionRows(thirdId)
		assert.ok(q1 && q2 && q3)

		const reply = await download(`/api/tests/topics/${topicSlug}/export`)
		assert.equal(reply.status, 200)
		assert.equal(reply.headers.get('content-type'), 'application/zip')
		assert.equal(reply.headers.get('content-disposition'), `attachment; filename="${topicSlug}.zip"`)
		assert.deepEqual(
			[...reply.entries.keys()],
			[
				`${first}/settings.json`,
				`${first}/questions/${q1.id}/prompt.md`,
				`${first}/assets/l.png`,
				`${second}/settings.json`,
				`${second}/questions/${q2.id}/prompt.md`,
				`${third}/settings.json`,
				`${third}/questions/${q3.id}/prompt.md`,
				shared,
			]
		)
		assert.ok(reply.entries.get(shared)?.equals(mem.get(shared)?.data ?? Buffer.alloc(0)))
		assert.ok(reply.entries.get(`${first}/assets/l.png`)?.equals(mem.get(legacy)?.data ?? Buffer.alloc(0)))
	})

	test('withAnswers=true: answer_keys.json каждого теста под <testSlug>/, хранилище не меняется', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const slug = nextSlug('ans')
		const testId = await saveTest(topicId, slug, [radio('Ответ c', { order: 0, correct: 'c' })])
		const [row] = await questionRows(testId)
		assert.ok(row)
		const before = mem.keys()
		const reply = await download(`/api/tests/topics/${topicSlug}/export?withAnswers=true`)
		assert.equal(reply.status, 200)
		assert.deepEqual([...reply.entries.keys()].slice(0, 2), [`${slug}/settings.json`, `${slug}/answer_keys.json`])
		assert.deepEqual(JSON.parse(text(reply.entries, `${slug}/answer_keys.json`)), [
			{ questionId: row.id, correct: 'c' },
		])
		assert.deepEqual(mem.keys(), before)
	})

	test('студент: GET /api/tests/topics/<slug>/export → 403 Forbidden, и для несуществующей темы', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		await saveTest(topicId, nextSlug('closed'), [radio('Закрыто', { order: 0 })])
		for (const slug of [topicSlug, 'qcon-exp-no-such-topic']) {
			const reply = await call(ctx, 'GET', `/api/tests/topics/${slug}/export`, { cookies: studentJar })
			assert.equal(reply.status, 403)
			assert.equal(reply.body.error, 'Forbidden')
		}
		const absent = await call(ctx, 'GET', '/api/tests/topics/qcon-exp-no-such-topic/export', { cookies: adminJar })
		assert.equal(absent.status, 404)
	})

	test('тема вне зоны testScope → 403', async () => {
		const topicSlug = nextSlug('topic')
		await createTopic(topicSlug)
		const error = await rejection(
			qc.buildTopicArchive({ topicSlug, withAnswers: false, scope: { all: false, topicIds: [MISSING_ID] } })
		)
		assert.equal(error.statusCode, 403)
		assert.equal(error.message, 'Forbidden')
	})
})

describe('buildZip', () => {
	test('имя записи с .., пустым сегментом, ведущим / или повтором отклоняется до чтения хранилища', async () => {
		const { buildZip } = await import('../storage/zip.js')
		for (const name of ['../evil.txt', 'a/../../evil.txt', '/etc/passwd', 'a//b.txt', 'a/./b.txt', 'a\\b.txt', '']) {
			await assert.rejects(buildZip([{ name, buffer: Buffer.from('x') }]), /invalid entry name/)
		}
		await assert.rejects(
			buildZip([
				{ name: 'a.txt', buffer: Buffer.from('1') },
				{ name: 'a.txt', buffer: Buffer.from('2') },
			]),
			/invalid entry name/
		)
	})

	test('отсутствующий ключ добавляется к missing и в missing-files.txt, записи идут в порядке списка', async () => {
		const { buildZip } = await import('../storage/zip.js')
		const present = imageKey('present')
		mem.put(present, 'data', 'image/webp')
		const missing = ['topics/t/s/questions/q/prompt-0.md']
		const buffer = await buildZip(
			[
				{ name: 'b.txt', buffer: Buffer.from('b') },
				{ name: 'images/absent.webp', key: 'images/qcon-export-absent.webp' },
				{ name: 'a.txt', key: present },
			],
			{ missing }
		)
		const entries = readZipEntries(buffer)
		assert.deepEqual([...entries.keys()], ['b.txt', 'a.txt', 'missing-files.txt'])
		assert.deepEqual(missing, ['topics/t/s/questions/q/prompt-0.md', 'images/qcon-export-absent.webp'])
		assert.equal(text(entries, 'missing-files.txt'), `${missing.join('\n')}\n`)
	})
})

describe('лимит размера ZIP', () => {
	test('ZIP_RESPONSE_LIMIT_BYTES по умолчанию 4 400 000; buildTestArchive с limitBytes 1024 → 413', async () => {
		assert.equal(qc.ZIP_RESPONSE_LIMIT_BYTES, 4_400_000)
		const topicId = await createTopic(nextSlug('topic'))
		const big = imageKey('big')
		mem.put(big, randomBytes(4096), 'image/webp')
		const testId = await saveTest(topicId, nextSlug('limit'), [radio(`Большая ![](${big})`, { order: 0 })])
		const error = await rejection(qc.buildTestArchive({ testId, withAnswers: false, limitBytes: 1024 }))
		assert.equal(error.statusCode, 413)
		assert.equal(error.message, TOO_LARGE)
		const fits = await qc.buildTestArchive({ testId, withAnswers: false })
		assert.ok(fits.buffer.length > 4096)
	})

	test('buildTopicArchive с limitBytes 1024 → 413', async () => {
		const topicSlug = nextSlug('topic')
		const topicId = await createTopic(topicSlug)
		const big = imageKey('topic-big')
		mem.put(big, randomBytes(4096), 'image/webp')
		await saveTest(topicId, nextSlug('limit'), [radio(`Большая ![](${big})`, { order: 0 })])
		const error = await rejection(
			qc.buildTopicArchive({ topicSlug, withAnswers: false, scope: { all: true }, limitBytes: 1024 })
		)
		assert.equal(error.statusCode, 413)
		assert.equal(error.message, TOO_LARGE)
	})

	test('GET /api/tests/<id>/export с картинкой 4 500 000 байт → 413 JSON без Content-Disposition', async () => {
		const topicId = await createTopic(nextSlug('topic'))
		const huge = imageKey('huge')
		mem.put(huge, randomBytes(4_500_000), 'image/webp')
		const testId = await saveTest(topicId, nextSlug('huge'), [radio(`Огромная ![](${huge})`, { order: 0 })])
		const reply = await download(`/api/tests/${testId}/export`)
		assert.equal(reply.status, 413)
		assert.match(reply.headers.get('content-type') ?? '', /^application\/json/)
		assert.equal(reply.headers.get('content-disposition'), null)
		assert.equal((JSON.parse(reply.buffer.toString('utf8')) as Json).error, TOO_LARGE)
		await mem.remove([huge])
	})
})
