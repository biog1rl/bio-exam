import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { MalformedBodyError } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

import {
	adminTestsKeys,
	adminTestsListFetcher,
	deleteTest,
	deleteTopic,
	exportTestArchive,
	exportTopicArchive,
	fetchTopicTeacherOptions,
	parseAdminTestsList,
	parseTopicsList,
	saveTopic,
	setTopicTeachers,
	topicsListFetcher,
} from './admin-api'

const apiFetchMock = vi.mocked(apiFetch)

const TEST_ID = '33333333-3333-4333-8333-333333333333'
const DRAFT_ID = '44444444-4444-4444-8444-444444444444'
const TOPIC_ID = '55555555-5555-4555-8555-555555555555'
const TEACHER_ID = '66666666-6666-4666-8666-666666666666'

const TOPIC_BODY = { slug: 'cell', title: 'Клетка', description: '', order: 2, isActive: true }

const ARCHIVE_TRUNCATED_TEXT = 'Не удалось скачать архив. Попробуйте ещё раз.'

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function zipBytes(): Uint8Array {
	const entry = new TextEncoder().encode('PK\u0003\u0004 entry body')
	const end = new Uint8Array(22)
	end.set([0x50, 0x4b, 0x05, 0x06])
	const bytes = new Uint8Array(entry.length + end.length)
	bytes.set(entry)
	bytes.set(end, entry.length)
	return bytes
}

function zip(bytes: Uint8Array, disposition?: string): Response {
	const headers: Record<string, string> = { 'content-type': 'application/zip' }
	if (disposition) headers['content-disposition'] = disposition
	return new Response(bytes, { status: 200, headers })
}

function lastCall(): { url: string; init: RequestInit } {
	const call = apiFetchMock.mock.calls.at(-1)
	assert.ok(call)
	return { url: call[0], init: call[1] ?? {} }
}

function lastJson(): unknown {
	const body = lastCall().init.body
	assert.equal(typeof body, 'string')
	return JSON.parse(body as string)
}

function lastUrl(): string {
	const call = apiFetchMock.mock.calls.at(-1)
	assert.ok(call)
	return call[0]
}

beforeEach(() => {
	apiFetchMock.mockReset()
})

describe('adminTestsKeys', () => {
	test('общие ключи списка тестов и тем', () => {
		assert.equal(adminTestsKeys.list(), '/api/tests')
		assert.equal(adminTestsKeys.topics(), '/api/tests/topics')
	})

	test('тест по slug с видом и без', () => {
		assert.equal(adminTestsKeys.bySlug('a', 'b', 'summary'), '/api/tests/by-slug/a/b?view=summary')
		assert.equal(adminTestsKeys.bySlug('a', 'b'), '/api/tests/by-slug/a/b')
	})

	test('типы вопросов совпадают с сегодняшними строками экранов', () => {
		assert.equal(adminTestsKeys.questionTypes(), '/api/tests/question-types')
		assert.equal(
			adminTestsKeys.questionTypes({ includeInactive: true }),
			'/api/tests/question-types?includeInactive=true'
		)
		assert.equal(
			adminTestsKeys.questionTypes({ testId: TEST_ID, includeInactive: true }),
			`/api/tests/question-types?testId=${TEST_ID}&includeInactive=true`
		)
	})

	test('черновики, назначения и правила баллов', () => {
		assert.equal(adminTestsKeys.questionDrafts(TEST_ID), `/api/tests/${TEST_ID}/question-drafts`)
		assert.equal(adminTestsKeys.questionDraft(TEST_ID, DRAFT_ID), `/api/tests/${TEST_ID}/question-drafts/${DRAFT_ID}`)
		assert.equal(adminTestsKeys.assignments(TEST_ID), `/api/tests/${TEST_ID}/assignments`)
		assert.equal(adminTestsKeys.scoringGlobal(), '/api/tests/question-types?includeInactive=true')
		assert.equal(
			adminTestsKeys.scoringTest(TEST_ID),
			`/api/tests/question-types?testId=${TEST_ID}&includeInactive=true`
		)
	})
})

describe('parseAdminTestsList', () => {
	test('{ tests: [] } проходит тем же объектом: ключ общий', () => {
		const body = { tests: [], extra: 1 }
		assert.equal(parseAdminTestsList(body), body)
		const filled = { tests: [{ id: TEST_ID, title: 'Тест', topicTitle: null }] }
		assert.equal(parseAdminTestsList(filled), filled)
	})

	test('прочее — MalformedBodyError', () => {
		for (const body of [null, undefined, [], 'tests', {}, { tests: {} }, { error: 'Forbidden' }]) {
			assert.throws(() => parseAdminTestsList(body), MalformedBodyError, JSON.stringify(body))
		}
	})

	test('adminTestsListFetcher возвращает тело списка без преобразования', async () => {
		const body = { tests: [{ id: TEST_ID, title: 'Тест', topicTitle: 'Тема' }] }
		apiFetchMock.mockResolvedValueOnce(json(200, body))
		assert.deepEqual(await adminTestsListFetcher(adminTestsKeys.list()), body)
		assert.equal(lastUrl(), '/api/tests')
	})
})

describe('exportTestArchive', () => {
	test('GET экспорта с ответами, имя из Content-Disposition', async () => {
		apiFetchMock.mockResolvedValueOnce(zip(zipBytes(), 'attachment; filename="biology.zip"'))
		const outcome = await exportTestArchive(TEST_ID, true)
		assert.equal(lastUrl(), `/api/tests/${TEST_ID}/export?withAnswers=true`)
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.filename, 'biology.zip')
		assert.equal(outcome.data.blob.size, zipBytes().length)
	})

	test('без Content-Disposition — запасное имя test.zip', async () => {
		apiFetchMock.mockResolvedValueOnce(zip(zipBytes()))
		const outcome = await exportTestArchive(TEST_ID, false)
		assert.equal(lastUrl(), `/api/tests/${TEST_ID}/export?withAnswers=false`)
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.filename, 'test.zip')
	})

	test('200 без конца центрального каталога — network со status 200', async () => {
		const bytes = zipBytes()
		apiFetchMock.mockResolvedValueOnce(zip(bytes.slice(0, Math.max(0, bytes.length - 30))))
		const outcome = await exportTestArchive(TEST_ID, true)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'network')
		assert.equal(outcome.status, 200)
		assert.equal(outcome.message, ARCHIVE_TRUNCATED_TEXT)
	})

	test('200 с хвостом архива, обрезанным на 10 байт, — network', async () => {
		const bytes = zipBytes()
		apiFetchMock.mockResolvedValueOnce(zip(bytes.slice(0, bytes.length - 10)))
		const outcome = await exportTestArchive(TEST_ID, true)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'network')
		assert.equal(outcome.status, 200)
	})

	test('413 — http с текстом сервера', async () => {
		const text = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'
		apiFetchMock.mockResolvedValueOnce(json(413, { error: text }))
		const outcome = await exportTestArchive(TEST_ID, true)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 413)
		assert.deepEqual(outcome.body, { error: text })
		assert.equal(outcome.message, text)
	})
})

describe('exportTopicArchive', () => {
	test('GET экспорта темы без ответов, запасное имя <slug>.zip', async () => {
		apiFetchMock.mockResolvedValueOnce(zip(zipBytes()))
		const outcome = await exportTopicArchive('cell', false)
		assert.equal(lastUrl(), '/api/tests/topics/cell/export?withAnswers=false')
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.filename, 'cell.zip')
	})

	test('усечённый архив темы — network со status 200', async () => {
		const bytes = zipBytes()
		apiFetchMock.mockResolvedValueOnce(zip(bytes.slice(0, Math.max(0, bytes.length - 30))))
		const outcome = await exportTopicArchive('cell', true)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'network')
		assert.equal(outcome.status, 200)
		assert.equal(outcome.message, ARCHIVE_TRUNCATED_TEXT)
	})

	test('403 — http 403', async () => {
		apiFetchMock.mockResolvedValueOnce(json(403, { error: 'Forbidden' }))
		const outcome = await exportTopicArchive('cell', true)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 403)
	})
})

describe('parseTopicsList', () => {
	test('{ topics: [] } проходит тем же объектом: ключ общий', () => {
		const body = { topics: [], extra: 1 }
		assert.equal(parseTopicsList(body), body)
		const filled = { topics: [{ id: TOPIC_ID, slug: 'cell', title: 'Клетка' }] }
		assert.equal(parseTopicsList(filled), filled)
	})

	test('прочее — MalformedBodyError', () => {
		for (const body of [null, undefined, [], 'topics', {}, { topics: {} }, { error: 'Forbidden' }]) {
			assert.throws(() => parseTopicsList(body), MalformedBodyError, JSON.stringify(body))
		}
	})

	test('topicsListFetcher возвращает тело без преобразования', async () => {
		const body = { topics: [{ id: TOPIC_ID, slug: 'cell', title: 'Клетка', teachers: [] }] }
		apiFetchMock.mockResolvedValueOnce(json(200, body))
		assert.deepEqual(await topicsListFetcher(adminTestsKeys.topics()), body)
		assert.equal(lastUrl(), '/api/tests/topics')
	})
})

describe('deleteTopic и deleteTest', () => {
	test('DELETE темы по id', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await deleteTopic(TOPIC_ID)
		assert.equal(lastCall().url, `/api/tests/topics/${TOPIC_ID}`)
		assert.equal(lastCall().init.method, 'DELETE')
		assert.equal(outcome.ok, true)
	})

	test('DELETE теста по id', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await deleteTest(TEST_ID)
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}`)
		assert.equal(lastCall().init.method, 'DELETE')
		assert.equal(outcome.ok, true)
	})

	test('409 удаления теста — исход со status и body', async () => {
		const body = { error: 'Нельзя удалить тест: по нему есть попытки' }
		apiFetchMock.mockResolvedValueOnce(json(409, body))
		const outcome = await deleteTest(TEST_ID)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 409)
		assert.deepEqual(outcome.body, body)
	})

	test('403 удаления темы — исход со status и body', async () => {
		apiFetchMock.mockResolvedValueOnce(json(403, { error: 'Forbidden' }))
		const outcome = await deleteTopic(TOPIC_ID)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.status, 403)
		assert.deepEqual(outcome.body, { error: 'Forbidden' })
	})
})

describe('saveTopic', () => {
	test('без id — POST списка тем с телом формы', async () => {
		const topic = { id: TOPIC_ID, ...TOPIC_BODY }
		apiFetchMock.mockResolvedValueOnce(json(201, { topic }))
		const outcome = await saveTopic({ body: TOPIC_BODY })
		assert.equal(lastCall().url, '/api/tests/topics')
		assert.equal(lastCall().init.method, 'POST')
		assert.deepEqual(lastJson(), TOPIC_BODY)
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.topic.id, TOPIC_ID)
	})

	test('с id — PATCH темы', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { topic: { id: TOPIC_ID, ...TOPIC_BODY } }))
		await saveTopic({ id: TOPIC_ID, body: TOPIC_BODY })
		assert.equal(lastCall().url, `/api/tests/topics/${TOPIC_ID}`)
		assert.equal(lastCall().init.method, 'PATCH')
		assert.deepEqual(lastJson(), TOPIC_BODY)
	})

	test('409 с английским текстом — исход со status и body, текст запасной', async () => {
		apiFetchMock.mockResolvedValueOnce(json(409, { error: 'Topic with this slug already exists' }))
		const outcome = await saveTopic({ body: TOPIC_BODY })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.status, 409)
		assert.deepEqual(outcome.body, { error: 'Topic with this slug already exists' })
		assert.equal(outcome.message, 'Ошибка сохранения')
	})

	test('200 без topic — malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await saveTopic({ id: TOPIC_ID, body: TOPIC_BODY })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'malformed')
	})
})

describe('setTopicTeachers и fetchTopicTeacherOptions', () => {
	test('PUT учителей темы с { teacherIds }', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { teachers: [] }))
		const outcome = await setTopicTeachers(TOPIC_ID, [TEACHER_ID])
		assert.equal(lastCall().url, `/api/tests/topics/${TOPIC_ID}/teachers`)
		assert.equal(lastCall().init.method, 'PUT')
		assert.deepEqual(lastJson(), { teacherIds: [TEACHER_ID] })
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.status, 200)
	})

	test('отказ PUT — исход со status', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Учитель не найден' }))
		const outcome = await setTopicTeachers(TOPIC_ID, [])
		assert.deepEqual(lastJson(), { teacherIds: [] })
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.status, 400)
		assert.deepEqual(outcome.body, { error: 'Учитель не найден' })
	})

	test('GET кандидатов в учителя', async () => {
		const teachers = [{ id: TEACHER_ID, name: 'teacher', firstName: 'Анна', lastName: null }]
		apiFetchMock.mockResolvedValueOnce(json(200, { teachers }))
		const outcome = await fetchTopicTeacherOptions()
		assert.equal(lastCall().url, '/api/tests/topics/teacher-options')
		assert.equal(lastCall().init.method, 'GET')
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.deepEqual(outcome.data.teachers, teachers)
	})

	test('кандидаты без массива teachers — malformed, 403 — http', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { teachers: null }))
		const malformed = await fetchTopicTeacherOptions()
		assert.equal(malformed.ok, false)
		if (!malformed.ok) assert.equal(malformed.kind, 'malformed')
		apiFetchMock.mockResolvedValueOnce(json(403, { error: 'Forbidden' }))
		const denied = await fetchTopicTeacherOptions()
		assert.equal(denied.ok, false)
		if (!denied.ok) assert.equal(denied.status, 403)
	})
})
