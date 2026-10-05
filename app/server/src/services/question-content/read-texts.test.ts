import assert from 'node:assert/strict'
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type QuestionContentModule = typeof import('./index.js')

type Json = Record<string, unknown>

type ReadProbe = { reads: () => number; maxConcurrent: () => number; restore: () => void }

const PASSWORD = 'qcon-texts-password-1'
const TOPIC_SLUG = 'qcon-texts-topic'
const TEST_SLUG = 'qcon-texts-test'
const ADMIN_QUESTIONS = 30
const READ_DELAY_MS = 20
const BASE = 'topics/qcon-texts/s/questions'

let ctx: AuthApp
let mem: MemoryStorageAdapter
let qc: QuestionContentModule
let testId = ''

function probeReads(delayMs: number): ReadProbe {
	const original = mem.read
	let reads = 0
	let inFlight = 0
	let maxConcurrent = 0
	mem.read = async (key: string) => {
		reads += 1
		inFlight += 1
		maxConcurrent = Math.max(maxConcurrent, inFlight)
		try {
			await new Promise((resolve) => setTimeout(resolve, delayMs))
			return await original(key)
		} finally {
			inFlight -= 1
		}
	}
	return {
		reads: () => reads,
		maxConcurrent: () => maxConcurrent,
		restore: () => {
			mem.read = original
		},
	}
}

async function withProbe<T>(fn: (probe: ReadProbe) => Promise<T>): Promise<T> {
	const probe = probeReads(READ_DELAY_MS)
	try {
		return await fn(probe)
	} finally {
		probe.restore()
	}
}

function seededRequests(count: number): Array<{ candidates: string[] }> {
	return Array.from({ length: count }, (_, index) => {
		const own = `${BASE}/q${index}`
		const legacy = `${BASE}/legacy-${index}`
		switch (index % 4) {
			case 0:
				mem.put(`${own}/prompt.md`, `Промпт ${index}`)
				break
			case 1:
				mem.put(`${legacy}/prompt.md`, `Старый путь ${index}`)
				break
			case 2:
				mem.put(`${own}/prompt.md`, '  ')
				mem.put(`${legacy}/prompt.md`, `После пустого ${index}`)
				break
			default:
				break
		}
		return { candidates: [`${own}/prompt.md`, `${legacy}/prompt.md`] }
	})
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_texts')
	await seedUser(ctx, { login: 'qcon_texts_admin', roles: ['admin'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_texts_admin', PASSWORD)
	assert.equal(admin.status, 200)
	mem = await memoryStorage()
	qc = await import('./index.js')
	const topic = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: admin.jar,
		body: { slug: TOPIC_SLUG, title: 'Тема чтения текстов' },
	})
	assert.equal(topic.status, 201)
	const saved = await call(ctx, 'POST', '/api/tests/save', {
		cookies: admin.jar,
		body: {
			topicId: (topic.body.topic as Json).id,
			title: 'Тест чтения текстов',
			slug: TEST_SLUG,
			isPublished: true,
			questions: Array.from({ length: ADMIN_QUESTIONS }, (_, index) => ({
				type: 'radio',
				promptText: `Промпт администратора ${index}`,
				explanationText: `Пояснение администратора ${index}`,
				options: [
					{ id: 'a', text: 'Да' },
					{ id: 'b', text: 'Нет' },
				],
				correct: 'a',
				points: 1,
				order: index,
			})),
		},
	})
	assert.equal(saved.status, 201)
	testId = (saved.body.test as Json).id as string
}, 60_000)

afterEach(() => {
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('readQuestionTexts', () => {
	test('вопросов больше потолка: одновременных чтений не больше PROMPT_READ_CONCURRENCY, результат равен последовательному эталону', async () => {
		const requests = seededRequests(qc.PROMPT_READ_CONCURRENCY * 3 + 1)
		const expected: string[] = []
		for (const request of requests) expected.push((await qc.findFirstMarkdown(request.candidates))?.text ?? '')

		const texts = await withProbe(async (probe) => {
			const result = await qc.readQuestionTexts(requests)
			assert.ok(probe.maxConcurrent() <= qc.PROMPT_READ_CONCURRENCY, `одновременно ${probe.maxConcurrent()}`)
			assert.ok(probe.maxConcurrent() > 1, `одновременно ${probe.maxConcurrent()}`)
			return result
		})
		assert.deepEqual(texts, expected)
		assert.ok(texts.some((text) => text === ''))
	})

	test('кандидаты одного вопроса перебираются по порядку', async () => {
		const at = (name: string) => `${BASE}/order-${name}/prompt.md`
		mem.put(at('blank'), '')
		mem.put(at('second'), 'Второй кандидат')
		mem.put(at('first'), 'Первый кандидат')
		mem.put(at('other'), 'Другой кандидат')
		const texts = await qc.readQuestionTexts([
			{ candidates: [at('blank'), at('second')] },
			{ candidates: [at('absent'), at('second')] },
			{ candidates: [at('first'), at('other')] },
			{ candidates: [at('absent'), at('absent-2')] },
			{ candidates: [] },
		])
		assert.deepEqual(texts, ['Второй кандидат', 'Второй кандидат', 'Первый кандидат', '', ''])
	})

	test('пустой список: пустой результат без чтений', async () => {
		await withProbe(async (probe) => {
			assert.deepEqual(await qc.readQuestionTexts([]), [])
			assert.equal(probe.reads(), 0)
		})
	})

	test('сбой чтения одного ключа отклоняет весь вызов', async () => {
		const requests = seededRequests(qc.PROMPT_READ_CONCURRENCY * 3 + 1)
		const broken = requests[requests.length - 2]?.candidates[0]
		assert.ok(broken)
		mem.failOn({ op: 'read', key: broken })
		await assert.rejects(qc.readQuestionTexts(requests), (error: unknown) => {
			const failure = error as { name?: unknown; statusCode?: unknown }
			assert.equal(failure.name, 'StorageUnavailableError')
			assert.equal(failure.statusCode, 503)
			return true
		})
	})
})

describe('readAdminTest с задержкой хранилища', () => {
	test(`${ADMIN_QUESTIONS} вопросов: чтения идут окном PROMPT_READ_CONCURRENCY, ответ прежний`, async () => {
		const result = await withProbe(async (probe) => {
			const read = await qc.readAdminTest({ testId })
			assert.equal(probe.reads(), ADMIN_QUESTIONS * 2)
			assert.equal(probe.maxConcurrent(), Math.min(qc.PROMPT_READ_CONCURRENCY, ADMIN_QUESTIONS * 2))
			return read
		})
		assert.ok('questions' in result)
		assert.deepEqual(
			result.questions.map((q) => ({
				promptText: q.promptText,
				explanationText: q.explanationText,
				correct: q.correct,
			})),
			Array.from({ length: ADMIN_QUESTIONS }, (_, index) => ({
				promptText: `Промпт администратора ${index}`,
				explanationText: `Пояснение администратора ${index}`,
				correct: 'a',
			}))
		)
	})

	test('сбой чтения одного ключа отклоняет чтение администратора', async () => {
		const result = await qc.readAdminTest({ testId })
		assert.ok('questions' in result)
		const rows = mem.keys(`topics/${TOPIC_SLUG}`).filter((key) => key.includes('/explanation-'))
		const broken = rows[rows.length - 1]
		assert.ok(broken)
		mem.failOn({ op: 'read', key: broken })
		await assert.rejects(qc.readAdminTest({ testId }), (error: unknown) => {
			assert.equal((error as { statusCode?: unknown }).statusCode, 503)
			return true
		})
	})
})
