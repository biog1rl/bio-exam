import { and, asc, count, eq, inArray } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerKeys, questions, tests, topics } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { ApiError } from '../../lib/errors.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { normalizeKey, storage, StorageKeyError, type StorageModule } from '../storage/index.js'
import { questionMarkdownCandidates } from './paths.js'

export type QuestionMarkdownKind = 'prompt' | 'explanation'

export type AdminTestSelector = { topicSlug: string; testSlug: string } | { testId: string }

export type AdminTestReadOptions = {
	view?: 'summary'
	canRead?: (testId: string) => Promise<boolean>
}

type TestRow = typeof tests.$inferSelect
type TopicRow = typeof topics.$inferSelect
type QuestionRow = typeof questions.$inferSelect

export type AdminTest = TestRow & { topicSlug: string | undefined; topicTitle: string | undefined }

export type AdminTestQuestion = {
	id: string
	type: string
	questionUiTemplate: string
	questionTypeTitle: string
	order: number
	points: number
	options: QuestionRow['options']
	matchingPairs: QuestionRow['matchingPairs']
	promptText: string
	explanationText: string
	correct: unknown
}

export type AdminTestSummary = { test: AdminTest; questionsCount: number }

export type AdminTestFull = { test: AdminTest; questions: AdminTestQuestion[] }

const ADMIN_READ_CONCURRENCY = 5

function isReadableKey(key: string): boolean {
	try {
		normalizeKey(key)
		return true
	} catch (error) {
		if (error instanceof StorageKeyError) return false
		throw error
	}
}

export async function readFirstMarkdown(candidates: string[]): Promise<string> {
	let module: StorageModule | null = null
	for (const candidate of candidates) {
		if (!isReadableKey(candidate)) continue
		module ??= storage()
		const content = await module.readText(candidate)
		if (content !== null && content.trim().length > 0) return content
	}
	return ''
}

export function readQuestionMarkdown(params: {
	storedPath: string | null
	topicSlug: string
	testSlug: string
	testId: string
	questionId: string
	kind: QuestionMarkdownKind
}): Promise<string> {
	const { kind, ...location } = params
	return readFirstMarkdown(questionMarkdownCandidates({ ...location, fileName: `${kind}.md` }))
}

async function readTexts(keys: string[]): Promise<Map<string, string>> {
	const found = new Map<string, string>()
	if (keys.length === 0) return found
	const module = storage()
	for (let i = 0; i < keys.length; i += ADMIN_READ_CONCURRENCY) {
		const batch = keys.slice(i, i + ADMIN_READ_CONCURRENCY)
		const contents = await Promise.all(batch.map((key) => module.readText(key)))
		batch.forEach((key, index) => {
			const content = contents[index]
			if (content !== null && content !== undefined) found.set(key, content)
		})
	}
	return found
}

async function findAdminTest(selector: AdminTestSelector): Promise<{ test: TestRow; topic: TopicRow | undefined }> {
	if ('testId' in selector) {
		const test = await db.query.tests.findFirst({ where: eq(tests.id, selector.testId) })
		if (!test) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
		const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
		return { test, topic }
	}
	const topic = await db.query.topics.findFirst({ where: eq(topics.slug, selector.topicSlug) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
	const test = await db.query.tests.findFirst({
		where: and(eq(tests.topicId, topic.id), eq(tests.slug, selector.testSlug)),
	})
	if (!test) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
	return { test, topic }
}

export async function readAdminTest(
	selector: AdminTestSelector,
	options: AdminTestReadOptions = {}
): Promise<AdminTestSummary | AdminTestFull> {
	const { test, topic } = await findAdminTest(selector)
	if (options.canRead && !(await options.canRead(test.id))) throw new ApiError(403, 'Forbidden')

	const adminTest: AdminTest = { ...test, topicSlug: topic?.slug, topicTitle: topic?.title }

	if (options.view === 'summary' && !('testId' in selector)) {
		const [totals] = await db.select({ count: count() }).from(questions).where(eq(questions.testId, test.id))
		return { test: adminTest, questionsCount: totals?.count ?? 0 }
	}

	const questionRows = await db
		.select()
		.from(questions)
		.where(eq(questions.testId, test.id))
		.orderBy(asc(questions.order))
	const questionTypesMap = await getQuestionTypeMapForTest({ testId: test.id, includeInactive: true })

	const questionIds = questionRows.map((q) => q.id)
	const answerKeyRows =
		questionIds.length > 0
			? await db
					.select()
					.from(answerKeys)
					.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))
			: []
	const answerKeyMap = new Map(answerKeyRows.map((ak) => [ak.questionId, ak.correctAnswer]))

	const filePaths: string[] = []
	for (const q of questionRows) {
		if (q.promptPath) filePaths.push(q.promptPath)
		if (q.explanationPath) filePaths.push(q.explanationPath)
	}
	const fileContents = await readTexts(filePaths)

	const questionsWithTexts = questionRows.map((q): AdminTestQuestion => {
		const promptText = q.promptPath ? fileContents.get(q.promptPath) || '' : ''
		const explanationText = q.explanationPath ? fileContents.get(q.explanationPath) || '' : ''
		const correct = answerKeyMap.get(q.id) ?? null
		const typeConfig = questionTypesMap[q.type]
		if (!typeConfig) {
			throw new Error(`Question type is not configured: ${q.type}`)
		}

		return {
			id: q.id,
			type: q.type,
			questionUiTemplate: typeConfig.uiTemplate,
			questionTypeTitle: typeConfig.title,
			order: q.order,
			points: q.points,
			options: q.options,
			matchingPairs: q.matchingPairs,
			promptText,
			explanationText,
			correct,
		}
	})

	return { test: adminTest, questions: questionsWithTexts }
}
