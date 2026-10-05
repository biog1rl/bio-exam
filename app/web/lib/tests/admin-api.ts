import type {
	AdminAttemptListItem,
	AdminAttemptsResponse,
} from '@/app/(internal)/(protected)/admin/attempts/attempts-types'
import type {
	QuestionTypeDefinition,
	QuestionTypeScoringRule,
	QuestionTypesResponse,
	QuestionTypeValidationSchema,
	QuestionUiTemplate,
	Test,
	Topic,
	TopicFormData,
	TopicsResponse,
} from '@/app/(internal)/(protected)/admin/tests/types'
import { hasZipEndOfCentralDirectory } from '@/lib/http/download'
import { exportFailureMessage } from '@/lib/http/errors'
import { MalformedBodyError, request, requestBlob, type RequestFailure, type RequestOutcome } from '@/lib/http/request'
import { fetcherWith } from '@/lib/http/swr'
import type { UserStatus } from '@/lib/users/status-filter'

import type { TopicTeacher } from './bank-view'

export type AdminTestListItem = Test

export type AdminTestsListResponse = { tests: AdminTestListItem[] }

export type TopicPayload = TopicFormData

export type TeacherOption = TopicTeacher

export type QuestionTypesQuery = { testId?: string; includeInactive?: boolean }

export type QuestionTypeResponse = { questionType: QuestionTypeDefinition }

export type QuestionTypePayload = {
	key?: string
	title?: string
	description?: string | null
	uiTemplate?: QuestionUiTemplate
	validationSchema?: QuestionTypeValidationSchema | null
	scoringRule?: QuestionTypeScoringRule
	isActive?: boolean
}

export type QuestionTypeOverridePayload = {
	titleOverride: string | null
	scoringRuleOverride: QuestionTypeScoringRule | null
	isDisabled: boolean
}

export type ScoringRulesResponse = QuestionTypesResponse

export type ScoringRuleEntry = { key: string; scoringRule: QuestionTypeScoringRule }

export type TestScoringRuleEntry = ScoringRuleEntry & {
	override: boolean
	saved: QuestionTypeOverridePayload | null
}

export type TestOverrideStep =
	| { key: string; method: 'PUT'; body: QuestionTypeOverridePayload }
	| { key: string; method: 'DELETE' }

export function testOverrideSteps(rules: readonly TestScoringRuleEntry[]): TestOverrideStep[] {
	const steps: TestOverrideStep[] = []
	for (const rule of rules) {
		const body: QuestionTypeOverridePayload = {
			titleOverride: rule.saved?.titleOverride ?? null,
			scoringRuleOverride: rule.override ? rule.scoringRule : null,
			isDisabled: rule.saved?.isDisabled ?? false,
		}
		const empty = !body.titleOverride && !body.isDisabled && body.scoringRuleOverride === null
		if (empty) {
			if (rule.saved) steps.push({ key: rule.key, method: 'DELETE' })
			continue
		}
		if (
			rule.saved &&
			JSON.stringify(rule.saved.scoringRuleOverride ?? null) === JSON.stringify(body.scoringRuleOverride)
		)
			continue
		steps.push({ key: rule.key, method: 'PUT', body })
	}
	return steps
}

export type ArchiveDownload = { blob: Blob; filename: string }

const EXPORT_FALLBACK_MESSAGE = 'Ошибка экспорта'

export type AttemptsFilters = {
	q: string
	topic: string | null
	student: string | null
	from: string | null
	to: string | null
	status: UserStatus
}

export type AttemptsDayRange = { from?: Date; to?: Date }

export type MergedAttempts = {
	rows: AdminAttemptListItem[]
	loaded: number
	total: number
	hasMore: boolean
}

export const ATTEMPTS_PAGE_SIZE = 50

export const ATTEMPTS_LOAD_ERROR = 'Не удалось загрузить попытки'

export const DEFAULT_ATTEMPTS_FILTERS: AttemptsFilters = {
	q: '',
	topic: null,
	student: null,
	from: null,
	to: null,
	status: 'active',
}

type AttemptsKey = `/api/tests/admin/attempts?${string}`

function attemptsKey(filters: AttemptsFilters, offset = 0): AttemptsKey {
	const params = new URLSearchParams()
	params.set('limit', String(ATTEMPTS_PAGE_SIZE))
	if (offset > 0) params.set('offset', String(offset))
	params.set('status', filters.status)
	const q = filters.q.trim()
	if (q) params.set('q', q)
	if (filters.topic) params.set('topic', filters.topic)
	if (filters.student) params.set('student', filters.student)
	if (filters.from) params.set('from', filters.from)
	if (filters.to) params.set('to', filters.to)
	return `/api/tests/admin/attempts?${params.toString()}`
}

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
	questionType: (key: string) => `${questionTypesKey()}/${key}`,
	questionDrafts: (testId: string) => `/api/tests/${testId}/question-drafts`,
	questionDraft: (testId: string, draftId: string) => `/api/tests/${testId}/question-drafts/${draftId}`,
	assignments: (testId: string) => `/api/tests/${testId}/assignments`,
	scoringGlobal: () => questionTypesKey({ includeInactive: true }),
	scoringTest: (testId: string) => questionTypesKey({ testId, includeInactive: true }),
	attempts: (filters: AttemptsFilters, offset?: number) => attemptsKey(filters, offset),
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

export function parseAdminAttempts(body: unknown): AdminAttemptsResponse {
	const record = asRecord(body)
	if (!Array.isArray(record.rows) || typeof record.total !== 'number' || typeof record.scopeTotal !== 'number') {
		throw new MalformedBodyError()
	}
	const summary = asRecord(record.summary)
	if (typeof summary.passed !== 'number') throw new MalformedBodyError()
	if (summary.averageScore !== null && typeof summary.averageScore !== 'number') throw new MalformedBodyError()
	const facets = asRecord(record.facets)
	if (!Array.isArray(facets.topics) || !Array.isArray(facets.students)) throw new MalformedBodyError()
	return body as AdminAttemptsResponse
}

export const adminAttemptsFetcher = fetcherWith(parseAdminAttempts)

export function fetchAdminAttemptsPage(
	filters: AttemptsFilters,
	offset: number
): Promise<RequestOutcome<AdminAttemptsResponse>> {
	return request(attemptsKey(filters, offset), { parse: parseAdminAttempts, fallbackMessage: ATTEMPTS_LOAD_ERROR })
}

function startOfDay(date: Date): Date {
	const value = new Date(date)
	value.setHours(0, 0, 0, 0)
	return value
}

function endOfDay(date: Date): Date {
	const value = new Date(date)
	value.setHours(23, 59, 59, 999)
	return value
}

export function attemptsDayRange(range: AttemptsDayRange | undefined): { from: string | null; to: string | null } {
	if (!range?.from) return { from: null, to: null }
	return { from: startOfDay(range.from).toISOString(), to: endOfDay(range.to ?? range.from).toISOString() }
}

export function mergeAttemptPages(pages: readonly AdminAttemptsResponse[]): MergedAttempts {
	const seen = new Set<string>()
	const rows: AdminAttemptListItem[] = []
	let loaded = 0
	for (const page of pages) {
		loaded += page.rows.length
		for (const row of page.rows) {
			if (seen.has(row.attemptId)) continue
			seen.add(row.attemptId)
			rows.push(row)
		}
	}
	const last = pages.at(-1)
	const total = last?.total ?? 0
	const hasMore = last !== undefined && last.rows.length > 0 && loaded < total
	return { rows, loaded, total, hasMore }
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

function testOverridePath(testId: string, key: string): string {
	return `${adminTestsKeys.questionTypes()}/tests/${testId}/overrides/${key}`
}

export function parseQuestionTypes(body: unknown): QuestionTypesResponse {
	if (!Array.isArray(asRecord(body).questionTypes)) throw new MalformedBodyError()
	return body as QuestionTypesResponse
}

export function parseScoringRules(body: unknown): ScoringRulesResponse {
	return parseQuestionTypes(body)
}

export function parseQuestionType(body: unknown): QuestionTypeResponse {
	if (typeof asRecord(asRecord(body).questionType).key !== 'string') throw new MalformedBodyError()
	return body as QuestionTypeResponse
}

export const questionTypesFetcher = fetcherWith(parseQuestionTypes)

export const questionTypeFetcher = fetcherWith(parseQuestionType)

export const scoringRulesFetcher = fetcherWith(parseScoringRules)

export function saveQuestionType(input: { key?: string; body: QuestionTypePayload }): Promise<RequestOutcome<unknown>> {
	if (input.key) {
		return request(adminTestsKeys.questionType(input.key), {
			method: 'PATCH',
			json: input.body,
			fallbackMessage: 'Не удалось сохранить тип вопроса',
		})
	}
	return request(adminTestsKeys.questionTypes(), {
		method: 'POST',
		json: input.body,
		fallbackMessage: 'Не удалось создать тип',
	})
}

export function deleteQuestionType(key: string): Promise<RequestOutcome<unknown>> {
	return request(adminTestsKeys.questionType(key), { method: 'DELETE', fallbackMessage: 'Не удалось отключить тип' })
}

export function saveTestQuestionTypeOverride(
	testId: string,
	key: string,
	body: QuestionTypeOverridePayload
): Promise<RequestOutcome<unknown>> {
	return request(testOverridePath(testId, key), {
		method: 'PUT',
		json: body,
		fallbackMessage: 'Не удалось сохранить настройки типа для теста',
	})
}

export function deleteTestQuestionTypeOverride(testId: string, key: string): Promise<RequestOutcome<unknown>> {
	return request(testOverridePath(testId, key), {
		method: 'DELETE',
		fallbackMessage: 'Не удалось сбросить настройки типа для теста',
	})
}

async function runInOrder(steps: Array<() => Promise<RequestOutcome<unknown>>>): Promise<RequestOutcome<unknown>> {
	let last: RequestOutcome<unknown> = { ok: true, status: 204, data: null }
	for (const step of steps) {
		last = await step()
		if (!last.ok) return last
	}
	return last
}

export function saveGlobalScoringRules(rules: ScoringRuleEntry[]): Promise<RequestOutcome<unknown>> {
	return runInOrder(
		rules.map(
			(rule) => () =>
				request(adminTestsKeys.questionType(rule.key), {
					method: 'PATCH',
					json: { scoringRule: rule.scoringRule },
					fallbackMessage: `Не удалось сохранить тип ${rule.key}`,
				})
		)
	)
}

export function saveTestScoringRules(testId: string, rules: TestScoringRuleEntry[]): Promise<RequestOutcome<unknown>> {
	return runInOrder(
		testOverrideSteps(rules).map((step) => () => {
			const fallbackMessage = `Не удалось сохранить формулу теста для типа ${step.key}`
			if (step.method === 'DELETE')
				return request(testOverridePath(testId, step.key), { method: 'DELETE', fallbackMessage })
			return request(testOverridePath(testId, step.key), { method: 'PUT', json: step.body, fallbackMessage })
		})
	)
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
