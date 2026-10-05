import { forgetQuestionDraftCopies } from '@/lib/drafts/question-draft-copy'
import { saveBlob } from '@/lib/http/download'
import { exportFailureMessage, failureMessage, failureOf } from '@/lib/http/errors'
import {
	MalformedBodyError,
	RequestError,
	requestJson,
	type RequestOptions,
	type RequestOutcome,
} from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'
import { adminTestsKeys, exportTestArchive, type ArchiveDownload } from '@/lib/tests/admin-api'

import type {
	QuestionDraftDetailResponse,
	QuestionDraftsResponse,
	QuestionTypesResponse,
	TestDetailResponse,
	TestFormData,
} from '../../types'
import type { StudentAssignment } from './test-editor-types'

export type TestSummaryResponse = Pick<TestDetailResponse, 'test'> & { questionsCount: number }

export type TestAssignmentsResponse = { assignments: StudentAssignment[] }

export type CreatedTestResponse = { test?: { id?: string; topicSlug?: string; slug?: string } } | null

export type UpdatedTestResponse = { test?: { topicSlug?: string }; assetsMoved?: boolean }

export type MoveQuestionTarget = { targetTestId: string } | { targetTopicId: string }

export type MovedQuestionPath = { topicSlug: string; testSlug: string }

export type ExportToast = { kind: 'success' | 'error'; text: string } | null

const EXPORT_FALLBACK_MESSAGE = 'Ошибка экспорта'
const EXPORT_SUCCESS_MESSAGE = 'Тест экспортирован'

function asRecord(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MalformedBodyError()
	return body as Record<string, unknown>
}

function requireTest(body: unknown): Record<string, unknown> {
	const record = asRecord(body)
	if (typeof asRecord(record.test).id !== 'string') throw new MalformedBodyError()
	return record
}

function requireArray(body: unknown, field: string): void {
	if (!Array.isArray(asRecord(body)[field])) throw new MalformedBodyError()
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
	asRecord(asRecord(body).draft)
	return body as QuestionDraftDetailResponse
}

export function parseTestAssignments(body: unknown): TestAssignmentsResponse {
	requireArray(body, 'assignments')
	return body as TestAssignmentsResponse
}

export function parseQuestionTypes(body: unknown): QuestionTypesResponse {
	requireArray(body, 'questionTypes')
	return body as QuestionTypesResponse
}

function parseCreatedTest(body: unknown): CreatedTestResponse {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return null
	return body as CreatedTestResponse
}

function parseUpdatedTest(body: unknown): UpdatedTestResponse {
	return asRecord(body) as UpdatedTestResponse
}

function parseMovedQuestion(body: unknown): MovedQuestionPath {
	const target = asRecord(asRecord(body).target)
	if (typeof target.topicSlug !== 'string' || typeof target.testSlug !== 'string') throw new MalformedBodyError()
	return { topicSlug: target.topicSlug, testSlug: target.testSlug }
}

export const testSummaryFetcher = fetcherWith(parseTestSummary)

export const testDetailFetcher = fetcherWith(parseTestDetail)

export const questionDraftsFetcher = fetcherWith(parseQuestionDrafts)

export const questionDraftDetailFetcher = fetcherWith(parseQuestionDraftDetail)

export const testAssignmentsFetcher = fetcherWith(parseTestAssignments)

export const questionTypesFetcher = fetcherWith(parseQuestionTypes)

export function actionErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof RequestError) return failureMessage(failureOf(error), fallback)
	if (error instanceof Error) return error.message
	return fallback
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

export function createTest(payload: TestFormData): Promise<CreatedTestResponse> {
	return send(`${adminTestsKeys.list()}/save`, 'Ошибка сохранения', {
		method: 'POST',
		json: payload,
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
		json: {
			topicId: form.topicId,
			title: form.title,
			slug: form.slug,
			description: form.description,
			isPublished: form.isPublished,
			showCorrectAnswer: form.showCorrectAnswer,
			scoringRules: form.scoringRules,
			timeLimitMinutes: form.timeLimitMinutes,
			redThresholdMinutes: form.redThresholdMinutes,
			warningThresholdMinutes: form.warningThresholdMinutes,
			passingScore: form.passingScore,
			order: form.order,
		},
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

export function fetchTestBySlug(topicSlug: string, testSlug: string): Promise<TestDetailResponse> {
	return send(adminTestsKeys.bySlug(topicSlug, testSlug), 'Не удалось загрузить тест', { parse: parseTestDetail })
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
