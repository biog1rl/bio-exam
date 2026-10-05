import type { Test, Topic, TopicFormData, TopicsResponse } from '@/app/(internal)/(protected)/admin/tests/types'
import { hasZipEndOfCentralDirectory } from '@/lib/http/download'
import { exportFailureMessage } from '@/lib/http/errors'
import { MalformedBodyError, request, requestBlob, type RequestFailure, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'

import type { TopicTeacher } from './bank-view'

export type AdminTestListItem = Test

export type AdminTestsListResponse = { tests: AdminTestListItem[] }

export type TopicPayload = TopicFormData

export type TeacherOption = TopicTeacher

export type QuestionTypesQuery = { testId?: string; includeInactive?: boolean }

export type ArchiveDownload = { blob: Blob; filename: string }

const EXPORT_FALLBACK_MESSAGE = 'Ошибка экспорта'

function questionTypesKey(query: QuestionTypesQuery = {}): string {
	const params = new URLSearchParams()
	if (query.testId) params.set('testId', query.testId)
	if (query.includeInactive) params.set('includeInactive', 'true')
	const search = params.toString()
	return search ? `/api/tests/question-types?${search}` : '/api/tests/question-types'
}

export const adminTestsKeys = {
	list: () => '/api/tests' as const,
	topics: () => '/api/tests/topics' as const,
	bySlug: (topicSlug: string, testSlug: string, view?: 'summary') =>
		`/api/tests/by-slug/${topicSlug}/${testSlug}${view ? `?view=${view}` : ''}`,
	questionTypes: (query?: QuestionTypesQuery) => questionTypesKey(query),
	questionDrafts: (testId: string) => `/api/tests/${testId}/question-drafts`,
	questionDraft: (testId: string, draftId: string) => `/api/tests/${testId}/question-drafts/${draftId}`,
	assignments: (testId: string) => `/api/tests/${testId}/assignments`,
	scoringGlobal: () => questionTypesKey({ includeInactive: true }),
	scoringTest: (testId: string) => questionTypesKey({ testId, includeInactive: true }),
}

export function parseAdminTestsList(body: unknown): AdminTestsListResponse {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MalformedBodyError()
	if (!Array.isArray((body as Record<string, unknown>).tests)) throw new MalformedBodyError()
	return body as AdminTestsListResponse
}

export const adminTestsListFetcher = fetcherWith(parseAdminTestsList)

function asRecord(body: unknown): Record<string, unknown> {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MalformedBodyError()
	return body as Record<string, unknown>
}

export function parseTopicsList(body: unknown): TopicsResponse {
	if (!Array.isArray(asRecord(body).topics)) throw new MalformedBodyError()
	return body as TopicsResponse
}

export const topicsListFetcher = fetcherWith(parseTopicsList)

function parseSavedTopic(body: unknown): { topic: Topic } {
	if (typeof asRecord(asRecord(body).topic).id !== 'string') throw new MalformedBodyError()
	return body as { topic: Topic }
}

function parseTeacherOptions(body: unknown): { teachers: TeacherOption[] } {
	if (!Array.isArray(asRecord(body).teachers)) throw new MalformedBodyError()
	return body as { teachers: TeacherOption[] }
}

function topicPath(topicId: string): string {
	return `${adminTestsKeys.topics()}/${topicId}`
}

export function deleteTopic(topicId: string): Promise<RequestOutcome<unknown>> {
	return request(topicPath(topicId), { method: 'DELETE' })
}

export function deleteTest(testId: string): Promise<RequestOutcome<unknown>> {
	return request(`${adminTestsKeys.list()}/${testId}`, { method: 'DELETE' })
}

export function saveTopic(input: { id?: string; body: TopicPayload }): Promise<RequestOutcome<{ topic: Topic }>> {
	const options = { json: input.body, parse: parseSavedTopic, fallbackMessage: 'Ошибка сохранения' }
	if (input.id) return request(topicPath(input.id), { ...options, method: 'PATCH' })
	return request(adminTestsKeys.topics(), { ...options, method: 'POST' })
}

export function setTopicTeachers(topicId: string, teacherIds: string[]): Promise<RequestOutcome<unknown>> {
	return request(`${topicPath(topicId)}/teachers`, { method: 'PUT', json: { teacherIds } })
}

export function fetchTopicTeacherOptions(): Promise<RequestOutcome<{ teachers: TeacherOption[] }>> {
	return request(`${adminTestsKeys.topics()}/teacher-options`, { parse: parseTeacherOptions })
}

function truncatedArchive(status: number): RequestFailure {
	const failure: RequestFailure = { ok: false, kind: 'network', status, message: '' }
	failure.message = exportFailureMessage(failure, EXPORT_FALLBACK_MESSAGE)
	return failure
}

async function downloadArchive(url: string, filename: string): Promise<RequestOutcome<ArchiveDownload>> {
	const outcome = await requestBlob(url, { filename, fallbackMessage: EXPORT_FALLBACK_MESSAGE })
	if (!outcome.ok) return outcome
	if (!(await hasZipEndOfCentralDirectory(outcome.data.blob))) return truncatedArchive(outcome.status)
	return outcome
}

export function exportTestArchive(testId: string, withAnswers: boolean): Promise<RequestOutcome<ArchiveDownload>> {
	return downloadArchive(`/api/tests/${testId}/export?withAnswers=${withAnswers}`, 'test.zip')
}

export function exportTopicArchive(topicSlug: string, withAnswers: boolean): Promise<RequestOutcome<ArchiveDownload>> {
	return downloadArchive(`/api/tests/topics/${topicSlug}/export?withAnswers=${withAnswers}`, `${topicSlug}.zip`)
}
