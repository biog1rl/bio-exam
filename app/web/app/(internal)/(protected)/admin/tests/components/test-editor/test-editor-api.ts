import { forgetQuestionDraftCopies } from '@/lib/drafts/question-draft-copy'
import { requireRecord } from '@/lib/http/body'
import { saveBlob } from '@/lib/http/download'
import { exportFailureMessage, failureMessage, failureOf, readApiError } from '@/lib/http/errors'
import {
	MalformedBodyError,
	RequestError,
	requestJson,
	type RequestOptions,
	type RequestOutcome,
} from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'
import { adminTestsKeys, exportTestArchive, type ArchiveDownload } from '@/lib/tests/admin-api'

import type { QuestionDraftDetailResponse, QuestionDraftsResponse, TestDetailResponse, TestFormData } from '../../types'
import { PHOTO_WINDOW_INVALID } from './photo-window'
import type { StudentAssignment } from './test-editor-types'
import { createTestBody, updateSettingsBody } from './test-settings-form'

export type TestSummaryResponse = Pick<TestDetailResponse, 'test'> & { questionsCount: number }

export type TestAssignmentsResponse = { assignments: StudentAssignment[] }

export type CreatedTestResponse = { test?: { id?: string; topicSlug?: string; slug?: string } } | null

export type UpdatedTestResponse = { test?: { topicSlug?: string }; assetsMoved?: boolean }

export type MoveQuestionTarget = { targetTestId: string } | { targetTopicId: string }

export type MovedQuestionPath = { topicSlug: string; testSlug: string }

export type ExportToast = { kind: 'success' | 'error'; text: string } | null

const EXPORT_FALLBACK_MESSAGE = 'Ошибка экспорта'
const EXPORT_SUCCESS_MESSAGE = 'Тест экспортирован'

function requireTest(body: unknown): Record<string, unknown> {
	const record = requireRecord(body)
	if (typeof requireRecord(record.test).id !== 'string') throw new MalformedBodyError()
	return record
}

function requireArray(body: unknown, field: string): void {
	if (!Array.isArray(requireRecord(body)[field])) throw new MalformedBodyError()
}

export function parseTestSummary(body: unknown): TestSummaryResponse {
	requireTest(body)
	return body as TestSummaryResponse
}

export function parseTestDetail(body: unknown): TestDetailResponse {
	requireTest(body)
	requireArray(body, 'questions')
	return body as TestDetailResponse
}

export function parseQuestionDrafts(body: unknown): QuestionDraftsResponse {
	requireArray(body, 'drafts')
	return body as QuestionDraftsResponse
}

export function parseQuestionDraftDetail(body: unknown): QuestionDraftDetailResponse {
	requireRecord(requireRecord(body).draft)
	return body as QuestionDraftDetailResponse
}

export function parseTestAssignments(body: unknown): TestAssignmentsResponse {
	requireArray(body, 'assignments')
	return body as TestAssignmentsResponse
}

function parseCreatedTest(body: unknown): CreatedTestResponse {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return null
	return body as CreatedTestResponse
}

function parseUpdatedTest(body: unknown): UpdatedTestResponse {
	return requireRecord(body) as UpdatedTestResponse
}

function parseMovedQuestion(body: unknown): MovedQuestionPath {
	const target = requireRecord(requireRecord(body).target)
	if (typeof target.topicSlug !== 'string' || typeof target.testSlug !== 'string') throw new MalformedBodyError()
	return { topicSlug: target.topicSlug, testSlug: target.testSlug }
}

export const testSummaryFetcher = fetcherWith(parseTestSummary)

export const testDetailFetcher = fetcherWith(parseTestDetail)

export const questionDraftsFetcher = fetcherWith(parseQuestionDrafts)

export const questionDraftDetailFetcher = fetcherWith(parseQuestionDraftDetail)

export const testAssignmentsFetcher = fetcherWith(parseTestAssignments)

export function actionErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof RequestError) return failureMessage(failureOf(error), fallback)
	if (error instanceof Error) return error.message
	return fallback
}

export const TEST_SLUG_TAKEN = 'Тест с таким адресом уже есть в этой теме'

function hasPhotoWindowFieldError(body: unknown): boolean {
	if (!body || typeof body !== 'object') return false
	const details = (body as Record<string, unknown>).details
	if (!details || typeof details !== 'object') return false
	const fieldErrors = (details as Record<string, unknown>).fieldErrors
	if (!fieldErrors || typeof fieldErrors !== 'object') return false
	const messages = (fieldErrors as Record<string, unknown>).photoUploadWindowMinutes
	return Array.isArray(messages) && messages.length > 0
}

export type TestSaveFailure = { slugError: string | null; photoWindowError: string | null; toast: string }

export function testSaveFailure(error: unknown, fallback: string): TestSaveFailure {
	if (error instanceof RequestError && error.kind === 'http') {
		if (error.status === 409 && readApiError(error.body) === null) {
			return { slugError: TEST_SLUG_TAKEN, photoWindowError: null, toast: '' }
		}
		if (error.status === 400 && hasPhotoWindowFieldError(error.body)) {
			return { slugError: null, photoWindowError: PHOTO_WINDOW_INVALID, toast: '' }
		}
	}
	return { slugError: null, photoWindowError: null, toast: actionErrorMessage(error, fallback) }
}

function send<T = unknown>(url: string, fallbackMessage: string, options: RequestOptions<T> = {}): Promise<T> {
	return requestJson<T>(url, { ...options, fallbackMessage })
}

function testPath(testId: string): string {
	return `${adminTestsKeys.list()}/${testId}`
}

export async function assignStudentToTest(testId: string, userId: string): Promise<void> {
	await send(adminTestsKeys.assignments(testId), 'Ошибка назначения студента', { method: 'POST', json: { userId } })
}

export async function removeStudentFromTest(testId: string, userId: string): Promise<void> {
	await send(`${adminTestsKeys.assignments(testId)}/${userId}`, 'Ошибка удаления студента', { method: 'DELETE' })
}

export function createTest(form: TestFormData): Promise<CreatedTestResponse> {
	return send(`${adminTestsKeys.list()}/save`, 'Ошибка сохранения', {
		method: 'POST',
		json: createTestBody(form),
		parse: parseCreatedTest,
	})
}

export async function reorderTestQuestions(testId: string, questionIds: string[]): Promise<void> {
	await send(`${testPath(testId)}/questions/reorder`, 'Не удалось сохранить порядок вопросов', {
		method: 'PUT',
		json: { questionIds },
	})
}

export function createQuestionDraft(testId: string): Promise<unknown> {
	return send(adminTestsKeys.questionDrafts(testId), 'Не удалось создать черновик вопроса', { method: 'POST' })
}

export async function deleteQuestionDraft(testId: string, draftId: string): Promise<void> {
	await send(adminTestsKeys.questionDraft(testId, draftId), 'Не удалось удалить черновик вопроса', {
		method: 'DELETE',
	})
	try {
		forgetQuestionDraftCopies(window.localStorage, draftId)
	} catch {
		return
	}
}

export async function deleteTestQuestion(testId: string, questionId: string): Promise<void> {
	await send(`${testPath(testId)}/questions/${questionId}`, 'Не удалось удалить вопрос', { method: 'DELETE' })
}

export function updateTestSettings(testId: string, form: TestFormData): Promise<UpdatedTestResponse> {
	return send(`${testPath(testId)}/settings`, 'Ошибка сохранения', {
		method: 'PATCH',
		json: updateSettingsBody(form),
		parse: parseUpdatedTest,
	})
}

export function moveTestQuestion(
	testId: string,
	questionId: string,
	target: MoveQuestionTarget
): Promise<MovedQuestionPath> {
	return send(`${testPath(testId)}/questions/${questionId}/move`, 'Ошибка переноса вопроса', {
		method: 'POST',
		json: target,
		parse: parseMovedQuestion,
	})
}

export async function saveTestQuestion(testId: string, questionId: string | null, question: unknown): Promise<void> {
	const url = questionId ? `${testPath(testId)}/questions/${questionId}` : `${testPath(testId)}/questions`
	await send(url, 'Ошибка сохранения вопроса', { method: questionId ? 'PATCH' : 'POST', json: question })
}

export function exportToast(outcome: RequestOutcome<ArchiveDownload>): ExportToast {
	if (outcome.ok) return { kind: 'success', text: EXPORT_SUCCESS_MESSAGE }
	const text = exportFailureMessage(outcome, EXPORT_FALLBACK_MESSAGE)
	return text ? { kind: 'error', text } : null
}

export async function exportTestFromEditor(testId: string, withAnswers: boolean): Promise<ExportToast> {
	const outcome = await exportTestArchive(testId, withAnswers)
	if (outcome.ok) saveBlob(outcome.data.blob, outcome.data.filename)
	return exportToast(outcome)
}
