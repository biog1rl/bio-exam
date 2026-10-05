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
	createQuestionDraft,
	createTest,
	deleteQuestionDraft,
	deleteTestQuestion,
	exportTestFromEditor,
	exportToast,
	fetchTestBySlug,
	moveTestQuestion,
	parseQuestionDraftDetail,
	parseQuestionDrafts,
	parseQuestionTypes,
	parseTestAssignments,
	parseTestDetail,
	parseTestSummary,
	removeStudentFromTest,
	reorderTestQuestions,
	saveTestQuestion,
	updateTestSettings,
} from './test-editor-api'

const apiFetchMock = vi.mocked(apiFetch)
const saveBlobMock = vi.mocked(saveBlob)

const TEST_ID = '33333333-3333-4333-8333-333333333333'
const DRAFT_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '55555555-5555-4555-8555-555555555555'
const QUESTION_ID = '66666666-6666-4666-8666-666666666666'

const ARCHIVE_READ_FAILED = 'Не удалось скачать архив. Попробуйте ещё раз.'
const ARCHIVE_TOO_LARGE = 'Архив слишком большой для выгрузки, экспортируйте тесты по отдельности'
const FORBIDDEN = 'Недостаточно прав для этого действия. Обратитесь к администратору.'
const NETWORK = 'Нет связи с сервером. Проверьте подключение и повторите попытку.'
const MALFORMED = 'Сервер вернул некорректный ответ. Повторите попытку позже.'

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

function brokenBody(): Response {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('PK\u0003\u0004'))
			controller.error(new TypeError('terminated'))
		},
	})
	return new Response(stream, { status: 200, headers: { 'content-type': 'application/zip' } })
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
	test('файл получен — тост успеха «Тест экспортирован»', () => {
		const outcome = { ok: true as const, status: 200, data: { blob: new Blob(['x']), filename: 'cell.zip' } }
		assert.deepEqual(exportToast(outcome), { kind: 'success', text: 'Тест экспортирован' })
	})

	test('413 с текстом сервера — этот текст', () => {
		const outcome = failure({ kind: 'http', status: 413, body: { error: ARCHIVE_TOO_LARGE } })
		assert.deepEqual(exportToast(outcome), { kind: 'error', text: ARCHIVE_TOO_LARGE })
	})

	test('обрыв тела после 200 — текст про повтор скачивания', () => {
		assert.deepEqual(exportToast(failure({ kind: 'network', status: 200 })), {
			kind: 'error',
			text: ARCHIVE_READ_FAILED,
		})
	})

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

	test('auth и aborted — без тоста', () => {
		assert.equal(exportToast(failure({ kind: 'auth' })), null)
		assert.equal(exportToast(failure({ kind: 'aborted' })), null)
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

	test('200 без Content-Disposition — запасное имя test.zip', async () => {
		apiFetchMock.mockResolvedValueOnce(zip(zipBytes()))
		await exportTestFromEditor(TEST_ID, false)
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/export?withAnswers=false`)
		assert.equal(saveBlobMock.mock.calls[0]![1], 'test.zip')
	})

	test('413 — тост с текстом сервера, файл не сохраняется', async () => {
		apiFetchMock.mockResolvedValueOnce(json(413, { error: ARCHIVE_TOO_LARGE }))
		assert.deepEqual(await exportTestFromEditor(TEST_ID, false), { kind: 'error', text: ARCHIVE_TOO_LARGE })
		assert.equal(saveBlobMock.mock.calls.length, 0)
	})

	test('обрыв чтения тела после 200 — текст про повтор скачивания, файл не сохраняется', async () => {
		apiFetchMock.mockResolvedValueOnce(brokenBody())
		assert.deepEqual(await exportTestFromEditor(TEST_ID, false), { kind: 'error', text: ARCHIVE_READ_FAILED })
		assert.equal(saveBlobMock.mock.calls.length, 0)
	})

	test('200 с усечённым архивом без конца центрального каталога — тот же текст, файл не сохраняется', async () => {
		apiFetchMock.mockResolvedValueOnce(zip(zipBytes().slice(0, 20), 'attachment; filename="cell.zip"'))
		assert.deepEqual(await exportTestFromEditor(TEST_ID, false), { kind: 'error', text: ARCHIVE_READ_FAILED })
		assert.equal(saveBlobMock.mock.calls.length, 0)
	})

	test('истёкшая сессия — без тоста и без файла', async () => {
		apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
		assert.equal(await exportTestFromEditor(TEST_ID, false), null)
		assert.equal(saveBlobMock.mock.calls.length, 0)
	})
})

describe('actionErrorMessage', () => {
	test('отказ запроса — текст модуля с запасным текстом вызывающего', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal Server Error' }))
		const error = await rejection(assignStudentToTest(TEST_ID, USER_ID))
		assert.equal(actionErrorMessage(error, 'Ошибка назначения студента'), 'Ошибка назначения студента')
	})

	test('русский текст сервера 4xx показывается, английский — нет', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Студент уже назначен' }))
		assert.equal(
			actionErrorMessage(await rejection(assignStudentToTest(TEST_ID, USER_ID)), 'Ошибка назначения студента'),
			'Студент уже назначен'
		)
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Bad request' }))
		assert.equal(
			actionErrorMessage(await rejection(assignStudentToTest(TEST_ID, USER_ID)), 'Ошибка назначения студента'),
			'Ошибка назначения студента'
		)
	})

	test('истёкшая сессия — пустая строка (без тоста)', async () => {
		apiFetchMock.mockRejectedValueOnce(new AuthExpiredError())
		assert.equal(actionErrorMessage(await rejection(removeStudentFromTest(TEST_ID, USER_ID)), 'x'), '')
	})

	test('сеть — текст про связь', async () => {
		apiFetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
		assert.equal(actionErrorMessage(await rejection(deleteTestQuestion(TEST_ID, QUESTION_ID)), 'x'), NETWORK)
	})

	test('обычная ошибка проверки — её текст, прочее — запасной текст', () => {
		assert.equal(actionErrorMessage(new Error('Укажите название теста'), 'x'), 'Укажите название теста')
		assert.equal(actionErrorMessage('boom', 'Ошибка сохранения'), 'Ошибка сохранения')
	})
})

describe('запросы слоя редактора', () => {
	test('assignStudentToTest — POST назначения с userId', async () => {
		apiFetchMock.mockResolvedValueOnce(json(201, { ok: true }))
		await assignStudentToTest(TEST_ID, USER_ID)
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/assignments`)
		assert.equal(lastCall().init.method, 'POST')
		assert.deepEqual(lastJson(), { userId: USER_ID })
	})

	test('removeStudentFromTest — DELETE назначения', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		await removeStudentFromTest(TEST_ID, USER_ID)
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/assignments/${USER_ID}`)
		assert.equal(lastCall().init.method, 'DELETE')
	})

	test('createTest — POST /api/tests/save и тело ответа', async () => {
		const created = { test: { id: TEST_ID, topicSlug: 'bio', slug: 'cell' } }
		apiFetchMock.mockResolvedValueOnce(json(200, created))
		assert.deepEqual(await createTest(FORM), created)
		assert.equal(lastCall().url, '/api/tests/save')
		assert.equal(lastCall().init.method, 'POST')
		assert.deepEqual(lastJson(), FORM)
	})

	test('createTest — 409 с русским текстом сервера', async () => {
		apiFetchMock.mockResolvedValueOnce(json(409, { error: 'Тест с таким slug уже существует' }))
		const error = await rejection(createTest(FORM))
		assert.equal(actionErrorMessage(error, 'Ошибка сохранения'), 'Тест с таким slug уже существует')
	})

	test('reorderTestQuestions — PUT порядка с questionIds', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		await reorderTestQuestions(TEST_ID, ['a', 'b'])
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/questions/reorder`)
		assert.equal(lastCall().init.method, 'PUT')
		assert.deepEqual(lastJson(), { questionIds: ['a', 'b'] })
	})

	test('createQuestionDraft — POST черновиков и тело ответа', async () => {
		apiFetchMock.mockResolvedValueOnce(json(201, { draft: { id: DRAFT_ID } }))
		assert.deepEqual(await createQuestionDraft(TEST_ID), { draft: { id: DRAFT_ID } })
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/question-drafts`)
		assert.equal(lastCall().init.method, 'POST')
	})

	test('createQuestionDraft — 500 даёт запасной текст создания черновика', async () => {
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Internal Server Error' }))
		const error = await rejection(createQuestionDraft(TEST_ID))
		assert.equal(
			actionErrorMessage(error, 'Не удалось создать черновик вопроса'),
			'Не удалось создать черновик вопроса'
		)
	})

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

	test('deleteTestQuestion — DELETE вопроса', async () => {
		apiFetchMock.mockResolvedValueOnce(json(200, { ok: true }))
		await deleteTestQuestion(TEST_ID, QUESTION_ID)
		assert.equal(lastCall().url, `/api/tests/${TEST_ID}/questions/${QUESTION_ID}`)
		assert.equal(lastCall().init.method, 'DELETE')
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

	test('updateTestSettings — некорректный ответ даёт отказ malformed', async () => {
		apiFetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }))
		const error = await rejection(updateTestSettings(TEST_ID, FORM))
		assert.equal(error.kind, 'malformed')
		assert.equal(actionErrorMessage(error, 'Ошибка сохранения'), MALFORMED)
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

	test('saveTestQuestion — английский текст сервера и 5xx не показываются', async () => {
		apiFetchMock.mockResolvedValueOnce(json(400, { error: 'Invalid question payload' }))
		assert.equal(
			actionErrorMessage(await rejection(saveTestQuestion(TEST_ID, null, {})), 'Ошибка сохранения вопроса'),
			'Ошибка сохранения вопроса'
		)
		apiFetchMock.mockResolvedValueOnce(json(500, { error: 'Ошибка базы данных' }))
		assert.equal(
			actionErrorMessage(await rejection(saveTestQuestion(TEST_ID, QUESTION_ID, {})), 'Ошибка сохранения вопроса'),
			'Ошибка сохранения вопроса'
		)
	})

	test('fetchTestBySlug — GET теста по slug с проверкой конверта', async () => {
		const body = { test: { id: TEST_ID }, questions: [] }
		apiFetchMock.mockResolvedValueOnce(json(200, body))
		assert.deepEqual(await fetchTestBySlug('bio', 'cell'), body)
		assert.equal(lastCall().url, '/api/tests/by-slug/bio/cell')
		apiFetchMock.mockResolvedValueOnce(json(200, { test: {} }))
		assert.equal((await rejection(fetchTestBySlug('bio', 'cell'))).kind, 'malformed')
		apiFetchMock.mockResolvedValueOnce(json(404, { error: 'Test not found' }))
		const error = await rejection(fetchTestBySlug('bio', 'cell'))
		assert.equal(actionErrorMessage(error, 'Не удалось загрузить тест'), 'Не удалось загрузить тест')
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
