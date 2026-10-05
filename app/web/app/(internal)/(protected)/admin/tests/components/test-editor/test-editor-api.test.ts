import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test, vi } from 'vitest'

vi.mock('@/lib/session/client', () => ({
	apiFetch: vi.fn(),
	AuthExpiredError: class AuthExpiredError extends Error {},
}))

vi.mock('@/lib/http/download', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/http/download')>()),
	saveBlob: vi.fn(),
}))

import { questionDraftCopyKey } from '@/lib/drafts/question-draft-copy'
import { saveBlob } from '@/lib/http/download'
import { MalformedBodyError, RequestError, type RequestFailure } from '@/lib/http/request'
import { apiFetch, AuthExpiredError } from '@/lib/session/client'

import type { TestFormData } from '../../types'
import {
	actionErrorMessage,
	assignStudentToTest,
	deleteQuestionDraft,
	deleteTestQuestion,
	exportTestFromEditor,
	exportToast,
	moveTestQuestion,
	parseQuestionDraftDetail,
	parseQuestionDrafts,
	parseQuestionTypes,
	parseTestAssignments,
	parseTestDetail,
	parseTestSummary,
	removeStudentFromTest,
	saveTestQuestion,
	updateTestSettings,
} from './test-editor-api'

const apiFetchMock = vi.mocked(apiFetch)
const saveBlobMock = vi.mocked(saveBlob)

const TEST_ID = '33333333-3333-4333-8333-333333333333'
const DRAFT_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '55555555-5555-4555-8555-555555555555'
const QUESTION_ID = '66666666-6666-4666-8666-666666666666'

const ARCHIVE_TOO_LARGE = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'
const FORBIDDEN = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
const NETWORK = 'Нет связи с сервером. Проверьте подключение и повторите попытку.'

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

async function rejection(promise: Promise<unknown>): Promise<RequestError> {
	try {
		await promise
	} catch (error) {
		assert.ok(error instanceof RequestError)
		return error
	}
	assert.fail('ожидался отказ')
}

function failure(draft: Omit<RequestFailure, 'ok' | 'message'>): RequestFailure {
	return { ok: false, message: '', ...draft }
}

const FORM: TestFormData = {
	topicId: 'topic-1',
	title: 'Клетка',
	slug: 'cell',
	description: 'Описание',
	isPublished: false,
	showCorrectAnswer: true,
	timeLimitMinutes: 30,
	redThresholdMinutes: 5,
	warningThresholdMinutes: 10,
	passingScore: 60,
	order: 2,
	questions: [],
}

beforeEach(() => {
	apiFetchMock.mockReset()
	saveBlobMock.mockReset()
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('exportToast', () => {
	test('403, 5xx, английский текст и сеть до ответа — тексты Поверхности 6', () => {
		assert.deepEqual(exportToast(failure({ kind: 'http', status: 403, body: { error: 'Forbidden' } })), {
			kind: 'error',
			text: FORBIDDEN,
		})
		assert.deepEqual(exportToast(failure({ kind: 'http', status: 500, body: { error: 'Ошибка БД' } })), {
			kind: 'error',
			text: 'Ошибка экспорта',
		})
		assert.deepEqual(exportToast(failure({ kind: 'http', status: 404, body: { error: 'Test not found' } })), {
			kind: 'error',
			text: 'Ошибка экспорта',
		})
		assert.deepEqual(exportToast(failure({ kind: 'network' })), { kind: 'error', text: NETWORK })
	})
})

describe('exportTestFromEditor', () => {
	test('200 — сохраняет файл с именем из Content-Disposition и путь экспорта прежний', async () => {
		apiFetchMock.mockResolvedValueOnce(zip(zipBytes(), 'attachment; filename="cell.zip"'))
		const toast = await exportTestFromEditor(TEST_ID, true)
		assert.deepEqual(toast, { kind: 'success', text: 'Тест экспортирован' })
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/export?withAnswers=true`)
		assert.equal(saveBlobMock.mock.calls.length, 1)
		const [blob, filename] = saveBlobMock.mock.calls[0]!
		assert.equal(filename, 'cell.zip')
		assert.equal(blob.size, zipBytes().length)
	})

	test('413 — тост с текстом сервера, файл не сохраняется', async () => {
		apiFetchMock.mockResolvedValueOnce(json(413, { error: ARCHIVE_TOO_LARGE }))
		assert.deepEqual(await exportTestFromEditor(TEST_ID, false), { kind: 'error', text: ARCHIVE_TOO_LARGE })
		assert.equal(saveBlobMock.mock.calls.length, 0)
	})

	test('истёкшая сессия — без тоста и без файла', async () => {
		apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
		assert.equal(await exportTestFromEditor(TEST_ID, false), null)
		assert.equal(saveBlobMock.mock.calls.length, 0)
	})
})

describe('actionErrorMessage', () => {
	test.each(
		(
			[
				{
					name: 'отказ запроса — текст модуля с запасным текстом вызывающего',
					cases: [
						{
							arrange: () => apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal Server Error' })),
							run: () => assignStudentToTest(TEST_ID, USER_ID),
							fallback: 'Ошибка назначения студента',
							expected: 'Ошибка назначения студента',
						},
					],
				},
				{
					name: 'русский текст сервера 4xx показывается, английский — нет',
					cases: [
						{
							arrange: () => apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Студент уже назначен' })),
							run: () => assignStudentToTest(TEST_ID, USER_ID),
							fallback: 'Ошибка назначения студента',
							expected: 'Студент уже назначен',
						},
						{
							arrange: () => apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Bad request' })),
							run: () => assignStudentToTest(TEST_ID, USER_ID),
							fallback: 'Ошибка назначения студента',
							expected: 'Ошибка назначения студента',
						},
					],
				},
				{
					name: 'истёкшая сессия — пустая строка (без тоста)',
					cases: [
						{
							arrange: () => apiFetchMock.mockRejectedValueOnce(new AuthExpiredError()),
							run: () => removeStudentFromTest(TEST_ID, USER_ID),
							fallback: 'x',
							expected: '',
						},
					],
				},
				{
					name: 'сеть — текст про связь',
					cases: [
						{
							arrange: () => apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')),
							run: () => deleteTestQuestion(TEST_ID, QUESTION_ID),
							fallback: 'x',
							expected: NETWORK,
						},
					],
				},
			] as {
				name: string
				cases: { arrange: () => void; run: () => Promise<unknown>; fallback: string; expected: string }[]
			}[]
		).map(
			(
				row
			): [
				string,
				{
					name: string
					cases: { arrange: () => void; run: () => Promise<unknown>; fallback: string; expected: string }[]
				},
			] => [row.name, row]
		)
	)('%s', async (_name, { cases }) => {
		for (const { arrange, run, fallback, expected } of cases) {
			arrange()
			assert.equal(actionErrorMessage(await rejection(run()), fallback), expected)
		}
	})

	test('обычная ошибка проверки — её текст, прочее — запасной текст', () => {
		assert.equal(actionErrorMessage(new Error('Укажите название теста'), 'x'), 'Укажите название теста')
		assert.equal(actionErrorMessage('boom', 'Ошибка сохранения'), 'Ошибка сохранения')
	})
})

describe('запросы слоя редактора', () => {
	test('deleteQuestionDraft — DELETE черновика и очистка его локальных копий', async () => {
		const keep = questionDraftCopyKey('other', USER_ID)
		const drop = questionDraftCopyKey(DRAFT_ID, USER_ID)
		const entries = new Map([
			[keep, '1'],
			[drop, '2'],
		])
		const storage = {
			get length() {
				return entries.size
			},
			key: (index: number) => [...entries.keys()][index] ?? null,
			removeItem: (key: string) => void entries.delete(key),
		}
		vi.stubGlobal('window', { localStorage: storage })
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		await deleteQuestionDraft(TEST_ID, DRAFT_ID)
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/question-drafts/${DRAFT_ID}`)
		assert.equal(lastCall().init.method, 'DELETE')
		assert.deepEqual([...entries.keys()], [keep])
	})

	test('deleteQuestionDraft — при отказе копии не трогаются', async () => {
		const drop = questionDraftCopyKey(DRAFT_ID, USER_ID)
		const entries = new Map([[drop, '2']])
		const storage = {
			get length() {
				return entries.size
			},
			key: (index: number) => [...entries.keys()][index] ?? null,
			removeItem: (key: string) => void entries.delete(key),
		}
		vi.stubGlobal('window', { localStorage: storage })
		apiFetchMock.mockResolvedValueOnce(json(404, { error: 'Draft not found' }))
		const error = await rejection(deleteQuestionDraft(TEST_ID, DRAFT_ID))
		assert.equal(error.status, 404)
		assert.deepEqual([...entries.keys()], [drop])
	})

	test('updateTestSettings — PATCH настроек без вопросов и тело ответа', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { test: { topicSlug: 'bio' }, assetsMoved: false }))
		assert.deepEqual(await updateTestSettings(TEST_ID, { ...FORM, scoringRules: undefined }), {
			test: { topicSlug: 'bio' },
			assetsMoved: false,
		})
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/settings`)
		assert.equal(lastCall().init.method, 'PATCH')
		const body = lastJson() as Record<string, unknown>
		assert.equal('questions' in body, false)
		assert.deepEqual(body, {
			topicId: 'topic-1',
			title: 'Клетка',
			slug: 'cell',
			description: 'Описание',
			isPublished: false,
			showCorrectAnswer: true,
			timeLimitMinutes: 30,
			redThresholdMinutes: 5,
			warningThresholdMinutes: 10,
			passingScore: 60,
			order: 2,
		})
	})

	test('moveTestQuestion — POST переноса и путь назначения', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { target: { topicSlug: 'bio', testSlug: 'cell-2' } }))
		assert.deepEqual(await moveTestQuestion(TEST_ID, QUESTION_ID, { targetTestId: 'test-2' }), {
			topicSlug: 'bio',
			testSlug: 'cell-2',
		})
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/questions/${QUESTION_ID}/move`)
		assert.equal(lastCall().init.method, 'POST')
		assert.deepEqual(lastJson(), { targetTestId: 'test-2' })
	})

	test('moveTestQuestion — ответ без пути назначения даёт malformed, английский текст скрыт', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { target: {} }))
		assert.equal((await rejection(moveTestQuestion(TEST_ID, QUESTION_ID, { targetTopicId: 't' }))).kind, 'malformed')
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Target topic not found' }))
		const error = await rejection(moveTestQuestion(TEST_ID, QUESTION_ID, { targetTopicId: 't' }))
		assert.equal(actionErrorMessage(error, 'Ошибка переноса вопроса'), 'Ошибка переноса вопроса')
	})

	test('saveTestQuestion — новый вопрос POST, существующий PATCH', async () => {
		const question = { promptText: 'Вопрос' }
		apiFetchMock.mockResolvedValueOnce(json(201, { question: { id: QUESTION_ID } }))
		await saveTestQuestion(TEST_ID, null, question)
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/questions`)
		assert.equal(lastCall().init.method, 'POST')
		assert.deepEqual(lastJson(), question)
		apiFetchMock.mockResolvedValueOnce(json(200, { question: { id: QUESTION_ID } }))
		await saveTestQuestion(TEST_ID, QUESTION_ID, question)
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/questions/${QUESTION_ID}`)
		assert.equal(lastCall().init.method, 'PATCH')
	})
})

describe('парсеры конвертов', () => {
	test('возвращают то же тело при верном конверте', () => {
		const summary = { test: { id: TEST_ID }, questionsCount: 2 }
		assert.equal(parseTestSummary(summary), summary)
		const detail = { test: { id: TEST_ID }, questions: [] }
		assert.equal(parseTestDetail(detail), detail)
		const drafts = { drafts: [] }
		assert.equal(parseQuestionDrafts(drafts), drafts)
		const draft = { draft: { id: DRAFT_ID, lockVersion: 1 } }
		assert.equal(parseQuestionDraftDetail(draft), draft)
		const assignments = { assignments: [] }
		assert.equal(parseTestAssignments(assignments), assignments)
		const questionTypes = { scope: 'global', questionTypes: [] }
		assert.equal(parseQuestionTypes(questionTypes), questionTypes)
	})

	test('бросают MalformedBodyError при неверном конверте', () => {
		const cases: Array<[(body: unknown) => unknown, unknown]> = [
			[parseTestSummary, { test: null }],
			[parseTestSummary, { error: 'x' }],
			[parseTestDetail, { test: { id: TEST_ID } }],
			[parseTestDetail, { questions: [] }],
			[parseQuestionDrafts, { drafts: {} }],
			[parseQuestionDraftDetail, { draft: null }],
			[parseTestAssignments, { error: 'x' }],
			[parseQuestionTypes, { questionTypes: null }],
			[parseQuestionTypes, []],
			[parseTestSummary, null],
		]
		for (const [parse, body] of cases) {
			assert.throws(() => parse(body), MalformedBodyError)
		}
	})
})
