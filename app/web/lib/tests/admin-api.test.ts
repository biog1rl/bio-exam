import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

import { createDefaultScoringRuleForTemplate, type ReviewStatus } from '@bio-exam/exam-core'

import { MalformedBodyError } from '@/lib/http/request'
import { apiFetch } from '@/lib/session/client'

import {
	ATTEMPTS_LOAD_ERROR,
	ATTEMPTS_PAGE_SIZE,
	adminAttemptsFetcher,
	adminTestsKeys,
	fetchAdminAttemptsPage,
	mergeAttemptPages,
	parseAdminAttempts,
	deleteQuestionType,
	deleteTestQuestionTypeOverride,
	exportTestArchive,
	exportTopicArchive,
	fetchTopicTeacherOptions,
	parseAdminTestsList,
	parseQuestionType,
	parseQuestionTypes,
	questionTypeFetcher,
	parseTopicsList,
	saveGlobalScoringRules,
	saveQuestionType,
	saveTestQuestionTypeOverride,
	saveTestScoringRules,
	saveTopic,
	testOverrideSteps,
} from './admin-api'
import { parseAttemptsUrl, type AttemptsUrlFilters } from './attempts-url'

const apiFetchMock = vi.mocked(apiFetch)

const TEST_ID = '33333333-3333-4333-8333-333333333333'
const TOPIC_ID = '55555555-5555-4555-8555-555555555555'

const TOPIC_BODY = { slug: 'cell', title: 'Клетка', description: '', order: 2, isActive: true }

const RULE_A = createDefaultScoringRuleForTemplate('short_text')
const RULE_B = createDefaultScoringRuleForTemplate('multi_choice')

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
})

describe('парсеры конвертов', () => {
	test.each(
		(
			[
				{
					name: 'parseAdminTestsList: { tests: [] } проходит тем же объектом: ключ общий',
					parse: parseAdminTestsList,
					bodies: [{ tests: [], extra: 1 }, { tests: [{ id: TEST_ID, title: 'Тест', topicTitle: null }] }],
				},
				{
					name: 'parseTopicsList: { topics: [] } проходит тем же объектом: ключ общий',
					parse: parseTopicsList,
					bodies: [{ topics: [], extra: 1 }, { topics: [{ id: TOPIC_ID, slug: 'cell', title: 'Клетка' }] }],
				},
				{
					name: 'parseQuestionTypes: { questionTypes: [] } проходит тем же объектом',
					parse: parseQuestionTypes,
					bodies: [{ questionTypes: [] }],
				},
			] as { name: string; parse: (body: unknown) => unknown; bodies: unknown[] }[]
		).map((row): [string, { name: string; parse: (body: unknown) => unknown; bodies: unknown[] }] => [row.name, row])
	)('%s', (_name, { parse, bodies }) => {
		for (const body of bodies) assert.equal(parse(body), body)
	})

	test.each(
		(
			[
				{
					name: 'parseAdminTestsList: прочее — MalformedBodyError',
					parse: parseAdminTestsList,
					bodies: [null, undefined, [], 'tests', {}, { tests: {} }, { error: 'Forbidden' }],
				},
				{
					name: 'parseTopicsList: прочее — MalformedBodyError',
					parse: parseTopicsList,
					bodies: [null, undefined, [], 'topics', {}, { topics: {} }, { error: 'Forbidden' }],
				},
				{
					name: 'parseQuestionTypes: прочее — MalformedBodyError',
					parse: parseQuestionTypes,
					bodies: [null, undefined, [], 'types', {}, { questionTypes: {} }, { error: 'Forbidden' }],
				},
				{
					name: 'parseQuestionType: без questionType или без ключа — MalformedBodyError',
					parse: parseQuestionType,
					bodies: [null, {}, { questionType: null }, { questionType: {} }, { error: 'Question type not found' }],
				},
			] as { name: string; parse: (body: unknown) => unknown; bodies: unknown[] }[]
		).map((row): [string, { name: string; parse: (body: unknown) => unknown; bodies: unknown[] }] => [row.name, row])
	)('%s', (_name, { parse, bodies }) => {
		for (const body of bodies) assert.throws(() => parse(body), MalformedBodyError, JSON.stringify(body))
	})
})

describe('запасное имя архива', () => {
	test.each(
		[
			{
				name: 'exportTestArchive: без Content-Disposition — запасное имя test.zip',
				run: () => exportTestArchive(TEST_ID, false),
				url: `/api/tests/${TEST_ID}/export?withAnswers=false`,
				filename: 'test.zip',
			},
			{
				name: 'exportTopicArchive: GET экспорта темы без ответов, запасное имя <slug>.zip',
				run: () => exportTopicArchive('cell', false),
				url: '/api/tests/topics/cell/export?withAnswers=false',
				filename: 'cell.zip',
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { run, url, filename }) => {
		apiFetchMock.mockResolvedValueOnce(zip(zipBytes()))
		const outcome = await run()
		assert.equal(lastUrl(), url)
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.filename, filename)
	})
})

describe('exportTestArchive', () => {
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
})

describe('saveTopic', () => {
	test.each(
		[
			{
				name: 'без id — POST списка тем с телом формы',
				id: undefined as string | undefined,
				status: 201,
				url: '/api/tests/topics',
				method: 'POST',
			},
			{
				name: 'с id — PATCH темы',
				id: TOPIC_ID as string | undefined,
				status: 200,
				url: `/api/tests/topics/${TOPIC_ID}`,
				method: 'PATCH',
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { id, status, url, method }) => {
		apiFetchMock.mockResolvedValueOnce(json(status, { topic: { id: TOPIC_ID, ...TOPIC_BODY } }))
		const outcome = await saveTopic(id === undefined ? { body: TOPIC_BODY } : { id, body: TOPIC_BODY })
		assert.equal(lastCall().url, url)
		assert.equal(lastCall().init.method, method)
		assert.deepEqual(lastJson(), TOPIC_BODY)
		assert.equal(outcome.ok, true)
		if (!outcome.ok) return
		assert.equal(outcome.data.topic.id, TOPIC_ID)
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

describe('saveGlobalScoringRules', () => {
	test('PATCH каждого типа с { scoringRule } по порядку', async () => {
		apiFetchMock.mockImplementation(async () => json(200, { ok: true }))
		const outcome = await saveGlobalScoringRules([
			{ key: 'a', scoringRule: RULE_A },
			{ key: 'b', scoringRule: RULE_B },
		])
		const calls = apiFetchMock.mock.calls.map(([url, init]) => [url, init?.method, JSON.parse(String(init?.body))])
		assert.deepEqual(calls, [
			['/api/tests/question-types/a', 'PATCH', { scoringRule: RULE_A }],
			['/api/tests/question-types/b', 'PATCH', { scoringRule: RULE_B }],
		])
		assert.equal(outcome.ok, true)
	})

	test('первый отказ останавливает запись и возвращается с текстом сервера', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Метрика несовместима с шаблоном' }))
		const outcome = await saveGlobalScoringRules([
			{ key: 'a', scoringRule: RULE_A },
			{ key: 'b', scoringRule: RULE_B },
		])
		assert.equal(apiFetchMock.mock.calls.length, 1)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.kind, 'http')
		assert.equal(outcome.status, 400)
		assert.equal(outcome.message, 'Метрика несовместима с шаблоном')
	})

	test('500 — запасной текст с ключом типа', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal Server Error' }))
		const outcome = await saveGlobalScoringRules([
			{ key: 'a', scoringRule: RULE_A },
			{ key: 'b', scoringRule: RULE_B },
		])
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.message, 'Не удалось сохранить тип b')
	})
})

describe('saveTestScoringRules', () => {
	const RENAMED = { titleOverride: 'Своё название', scoringRuleOverride: null, isDisabled: true }

	test('своя формула сохраняет название и отключение типа в тесте, пустая строка удаляется', async () => {
		apiFetchMock.mockImplementation(async () => json(200, { ok: true }))
		const outcome = await saveTestScoringRules(TEST_ID, [
			{ key: 'a', scoringRule: RULE_A, override: true, saved: RENAMED },
			{
				key: 'b',
				scoringRule: RULE_B,
				override: false,
				saved: { ...RENAMED, titleOverride: null, isDisabled: false, scoringRuleOverride: RULE_B },
			},
		])
		const calls = apiFetchMock.mock.calls.map(([url, init]) => [
			url,
			init?.method,
			init?.body === undefined ? undefined : JSON.parse(String(init.body)),
		])
		assert.deepEqual(calls, [
			[
				`/api/tests/question-types/tests/${TEST_ID}/overrides/a`,
				'PUT',
				{ titleOverride: 'Своё название', scoringRuleOverride: RULE_A, isDisabled: true },
			],
			[`/api/tests/question-types/tests/${TEST_ID}/overrides/b`, 'DELETE', undefined],
		])
		assert.equal(outcome.ok, true)
	})

	test('снятая формула у переименованного типа — PUT без формулы, а не DELETE; без изменений запросов нет', () => {
		assert.deepEqual(
			testOverrideSteps([
				{ key: 'a', scoringRule: RULE_A, override: false, saved: { ...RENAMED, scoringRuleOverride: RULE_A } },
				{ key: 'b', scoringRule: RULE_B, override: false, saved: null },
				{ key: 'c', scoringRule: RULE_A, override: true, saved: { ...RENAMED, scoringRuleOverride: RULE_A } },
			]),
			[{ key: 'a', method: 'PUT', body: RENAMED }]
		)
	})

	test('отказ записи возвращается, дальше запись не идёт', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal Server Error' }))
		const outcome = await saveTestScoringRules(TEST_ID, [
			{ key: 'b', scoringRule: RULE_B, override: true, saved: null },
			{ key: 'a', scoringRule: RULE_A, override: true, saved: null },
		])
		assert.equal(apiFetchMock.mock.calls.length, 1)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.status, 500)
		assert.equal(outcome.message, 'Не удалось сохранить формулу теста для типа b')
	})
})

describe('parseQuestionType и questionTypeFetcher', () => {
	test('{ questionType } с ключом проходит тем же объектом', async () => {
		const body = { questionType: { key: 'a', title: 'А' } }
		assert.equal(parseQuestionType(body), body)
		apiFetchMock.mockResolvedValueOnce(json(200, body))
		assert.deepEqual(await questionTypeFetcher(adminTestsKeys.questionType('a')), body)
		assert.equal(lastUrl(), '/api/tests/question-types/a')
	})
})

describe('saveQuestionType и deleteQuestionType', () => {
	const PAYLOAD = { key: 'my_type', title: 'Мой тип', uiTemplate: 'short_text', isActive: true } as const

	test.each(
		[
			{
				name: 'без key — POST списка типов',
				input: { body: PAYLOAD } as Parameters<typeof saveQuestionType>[0],
				status: 201,
				url: '/api/tests/question-types',
				method: 'POST',
			},
			{
				name: 'с key — PATCH типа',
				input: { key: 'my_type', body: { title: 'Новое' } } as Parameters<typeof saveQuestionType>[0],
				status: 200,
				url: '/api/tests/question-types/my_type',
				method: 'PATCH',
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { input, status, url, method }) => {
		apiFetchMock.mockResolvedValueOnce(json(status, { questionType: PAYLOAD }))
		const outcome = await saveQuestionType(input)
		assert.equal(lastCall().url, url)
		assert.equal(lastCall().init.method, method)
		assert.deepEqual(lastJson(), input.body)
		assert.equal(outcome.ok, true)
	})

	test.each(
		[
			{
				name: 'отказ создания с английским текстом — запасной текст, тело сохранено',
				input: { body: PAYLOAD } as Parameters<typeof saveQuestionType>[0],
				status: 409,
				body: { error: 'Question type already exists' } as Record<string, unknown>,
				message: 'Не удалось создать тип',
			},
			{
				name: 'отказ правки — запасной текст правки',
				input: { key: 'my_type', body: {} } as Parameters<typeof saveQuestionType>[0],
				status: 500,
				body: {} as Record<string, unknown>,
				message: 'Не удалось сохранить тип вопроса',
			},
		].map((row): [string, typeof row] => [row.name, row])
	)('%s', async (_name, { input, status, body, message }) => {
		apiFetchMock.mockResolvedValueOnce(json(status, body))
		const outcome = await saveQuestionType(input)
		assert.equal(outcome.ok, false)
		if (outcome.ok) return
		assert.equal(outcome.status, status)
		assert.deepEqual(outcome.body, body)
		assert.equal(outcome.message, message)
	})

	test('DELETE типа по ключу', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		const outcome = await deleteQuestionType('my_type')
		assert.equal(lastCall().url, '/api/tests/question-types/my_type')
		assert.equal(lastCall().init.method, 'DELETE')
		assert.equal(outcome.ok, true)
		apiFetchMock.mockResolvedValueOnce(json(500, {}))
		const failed = await deleteQuestionType('my_type')
		assert.equal(failed.ok, false)
		if (!failed.ok) assert.equal(failed.message, 'Не удалось отключить тип')
	})
})

describe('переопределения типа для теста', () => {
	const OVERRIDE = { titleOverride: null, scoringRuleOverride: RULE_A, isDisabled: true }

	test('отказы — запасные тексты экрана', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, {}))
		const saved = await saveTestQuestionTypeOverride(TEST_ID, 'a', OVERRIDE)
		assert.equal(saved.ok, false)
		if (!saved.ok) assert.equal(saved.message, 'Не удалось сохранить настройки типа для теста')
		apiFetchMock.mockResolvedValueOnce(json(403, { error: 'Forbidden' }))
		const removed = await deleteTestQuestionTypeOverride(TEST_ID, 'a')
		assert.equal(removed.ok, false)
		if (!removed.ok) assert.equal(removed.status, 403)
	})
})

const STUDENT_ID = '77777777-7777-4777-8777-777777777777'

function attemptRow(id: string) {
	return {
		attemptId: id,
		testId: TEST_ID,
		testTitle: 'Тест',
		testSlug: 'test',
		topicSlug: 'cell',
		topicTitle: 'Клетка',
		studentId: STUDENT_ID,
		studentIsActive: true,
		studentName: 'Иван',
		submittedAt: '2026-10-01T10:00:00.000Z',
		earnedPoints: 1,
		totalPoints: 2,
		scorePercentage: 50,
		passed: false,
		reviewStatus: 'none' as ReviewStatus,
		autoEarnedPoints: 1,
		autoTotalPoints: 2,
	}
}

function attemptsPage(ids: string[], total: number, offset = 0) {
	return {
		rows: ids.map(attemptRow),
		total,
		limit: ATTEMPTS_PAGE_SIZE,
		offset,
		summary: { passed: 0, averageScore: 50, pendingTotal: 0 },
		scopeTotal: total + 3,
		facets: {
			topics: [{ slug: 'cell', title: 'Клетка' }],
			students: [{ id: STUDENT_ID, name: 'Иван', isActive: true }],
		},
	}
}

describe('список попыток: ключ и запрос', () => {
	const DEFAULT_FILTERS: AttemptsUrlFilters = parseAttemptsUrl(new URLSearchParams())

	function keyParams(filters: Partial<AttemptsUrlFilters>, offset?: number): Record<string, string> {
		const url = new URL(adminTestsKeys.attempts({ ...DEFAULT_FILTERS, ...filters }, offset), 'https://web.test')
		assert.equal(url.pathname, '/api/tests/admin/attempts')
		return Object.fromEntries(url.searchParams)
	}

	test('по умолчанию первая страница активных учеников без сортировки в ключе', () => {
		assert.equal(ATTEMPTS_PAGE_SIZE, 50)
		assert.equal(adminTestsKeys.attempts(DEFAULT_FILTERS), '/api/tests/admin/attempts?limit=50&status=active')
	})

	test('фильтры попадают в строку ключа списками, поиск обрезается, offset только после первой страницы', () => {
		assert.deepEqual(
			keyParams(
				{
					q: '  50% a&b  ',
					topics: ['cell', 'tissue'],
					students: [STUDENT_ID, TEST_ID],
					results: ['failed'],
					status: 'all',
					review: 'pending',
					sort: { key: 'score', direction: 'asc' },
				},
				100
			),
			{
				limit: '50',
				offset: '100',
				status: 'all',
				q: '50% a&b',
				topic: 'cell,tissue',
				student: `${STUDENT_ID},${TEST_ID}`,
				result: 'failed',
				review: 'pending',
				sort: 'score',
				dir: 'asc',
			}
		)
		assert.equal(adminTestsKeys.attempts({ ...DEFAULT_FILTERS, q: '   ' }), adminTestsKeys.attempts(DEFAULT_FILTERS))
	})

	test('оба исхода результата значат без фильтра, сортировка по дате по убыванию не пишется', () => {
		const params = keyParams({ results: ['passed', 'failed'], sort: { key: 'date', direction: 'desc' } })
		assert.equal(params.result, undefined)
		assert.equal(params.sort, undefined)
		assert.deepEqual(keyParams({ sort: { key: 'date', direction: 'asc' } }), {
			limit: '50',
			status: 'active',
			sort: 'date',
			dir: 'asc',
		})
	})

	test('период: начало первого и конец последнего выбранного дня в локальном времени', () => {
		assert.deepEqual(keyParams({ from: '2026-09-30', to: '2026-10-02' }), {
			limit: '50',
			status: 'active',
			from: new Date(2026, 8, 30, 0, 0, 0, 0).toISOString(),
			to: new Date(2026, 9, 2, 23, 59, 59, 999).toISOString(),
		})
		const single = keyParams({ from: '2026-09-30', to: null })
		assert.equal(single.from, new Date(2026, 8, 30, 0, 0, 0, 0).toISOString())
		assert.equal(single.to, new Date(2026, 8, 30, 23, 59, 59, 999).toISOString())
		assert.deepEqual(keyParams({ from: null, to: '2026-10-02' }), { limit: '50', status: 'active' })
	})

	test('parseAdminAttempts пропускает полный ответ и отвергает старую форму', () => {
		const body = attemptsPage(['a'], 1)
		assert.equal(parseAdminAttempts(body), body)
		for (const bad of [
			null,
			[],
			{ rows: [], total: 0, limit: 50, offset: 0 },
			{ ...body, rows: {} },
			{ ...body, total: '1' },
			{ ...body, facets: { topics: [] } },
			{ ...body, summary: null },
			{ ...body, scopeTotal: undefined },
		]) {
			assert.throws(() => parseAdminAttempts(bad), MalformedBodyError, JSON.stringify(bad))
		}
	})

	test.each([
		{ name: 'averageScore: null принимается', averageScore: null, accepted: true },
		{ name: 'averageScore: число принимается', averageScore: 0, accepted: true },
		{ name: 'averageScore: строка отвергается', averageScore: '50', accepted: false },
		{ name: 'averageScore: undefined отвергается', averageScore: undefined, accepted: false },
	])('parseAdminAttempts: $name', ({ averageScore, accepted }) => {
		const page = attemptsPage(['a'], 1)
		const body = { ...page, summary: { ...page.summary, averageScore } }
		if (accepted) assert.equal(parseAdminAttempts(body), body)
		else assert.throws(() => parseAdminAttempts(body), MalformedBodyError)
	})

	test.each([
		{ name: 'pendingTotal: число принимается', pendingTotal: 3, accepted: true },
		{ name: 'pendingTotal: undefined отвергается', pendingTotal: undefined, accepted: false },
		{ name: 'pendingTotal: строка отвергается', pendingTotal: '3', accepted: false },
		{ name: 'pendingTotal: null отвергается', pendingTotal: null, accepted: false },
	])('parseAdminAttempts: $name', ({ pendingTotal, accepted }) => {
		const page = attemptsPage(['a'], 1)
		const body = { ...page, summary: { ...page.summary, pendingTotal } }
		if (accepted) assert.equal(parseAdminAttempts(body), body)
		else assert.throws(() => parseAdminAttempts(body), MalformedBodyError)
	})

	test.each([
		{ name: 'pending принимается', reviewStatus: 'pending', accepted: true },
		{ name: 'graded принимается', reviewStatus: 'graded', accepted: true },
		{ name: 'неизвестный статус отвергается', reviewStatus: 'done', accepted: false },
		{ name: 'отсутствующий статус отвергается', reviewStatus: undefined, accepted: false },
	])('parseAdminAttempts: строка, $name', ({ reviewStatus, accepted }) => {
		const page = attemptsPage(['a'], 1)
		const body = { ...page, rows: [{ ...page.rows[0], reviewStatus }] }
		if (accepted) assert.equal(parseAdminAttempts(body), body)
		else assert.throws(() => parseAdminAttempts(body), MalformedBodyError)
	})

	test('adminAttemptsFetcher и fetchAdminAttemptsPage идут по ключу', async () => {
		const body = attemptsPage(['a'], 1)
		apiFetchMock.mockResolvedValueOnce(json(200, body))
		const filters = parseAttemptsUrl(new URLSearchParams())
		const key = adminTestsKeys.attempts(filters)
		assert.deepEqual(await adminAttemptsFetcher(key), body)
		assert.equal(lastUrl(), key)

		apiFetchMock.mockResolvedValueOnce(json(200, attemptsPage(['b'], 2, 50)))
		const outcome = await fetchAdminAttemptsPage(filters, 50)
		assert.equal(lastUrl(), '/api/tests/admin/attempts?limit=50&offset=50&status=active')
		assert.equal(outcome.ok, true)

		apiFetchMock.mockResolvedValueOnce(json(500, {}))
		const failed = await fetchAdminAttemptsPage(filters, 50)
		assert.equal(failed.ok, false)
		if (!failed.ok) assert.equal(failed.message, ATTEMPTS_LOAD_ERROR)
		assert.equal(ATTEMPTS_LOAD_ERROR, 'Не удалось загрузить попытки')
	})
})

describe('mergeAttemptPages', () => {
	test('склеивает страницы по порядку, повтор на стыке не дублируется', () => {
		const merged = mergeAttemptPages([attemptsPage(['a', 'b'], 5), attemptsPage(['b', 'c'], 5, 2)])
		assert.deepEqual(
			merged.rows.map((row) => row.attemptId),
			['a', 'b', 'c']
		)
		assert.equal(merged.loaded, 4)
		assert.equal(merged.total, 5)
		assert.equal(merged.hasMore, true)
	})

	test('«Показать ещё» скрыта, когда загружено total', () => {
		const merged = mergeAttemptPages([attemptsPage(['a', 'b'], 3), attemptsPage(['c'], 3, 2)])
		assert.equal(merged.loaded, 3)
		assert.equal(merged.hasMore, false)
		assert.equal(mergeAttemptPages([attemptsPage(['a'], 1)]).hasMore, false)
		assert.equal(mergeAttemptPages([attemptsPage([], 0)]).hasMore, false)
	})

	test('total берётся из последней страницы, пустая страница останавливает догрузку', () => {
		const merged = mergeAttemptPages([attemptsPage(['a'], 9), attemptsPage([], 9, 1)])
		assert.equal(merged.total, 9)
		assert.equal(merged.hasMore, false)
		assert.equal(mergeAttemptPages([attemptsPage(['a'], 1), attemptsPage(['b'], 4, 1)]).total, 4)
	})
})
