import { and, eq, sql } from 'drizzle-orm'
import crypto from 'node:crypto'
import type { z } from 'zod'

import { db } from '../../db/index.js'
import { answerKeys, questions, tests, topics } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { ApiError } from '../../lib/errors.js'
import { getQuestionTypeMapForTest, validateQuestionWithType } from '../../lib/tests/question-type-resolver.js'
import type { SaveQuestionSchema, SaveTestSchema } from '../../schemas/tests.js'
import { upsertQuestionSearchDocument } from '../search/question-documents.js'
import { storage } from '../storage/index.js'
import { indexQuestionAssets } from './asset-index.js'
import { insertAt, lockTest, resequenceQuestions, type LockedTest, type Tx } from './order.js'
import { contentKey, newRevision } from './paths.js'

export type QuestionInput = z.infer<typeof SaveQuestionSchema>

export type TestWithQuestionsInput = z.infer<typeof SaveTestSchema>

export type QuestionTypeMap = Awaited<ReturnType<typeof getQuestionTypeMapForTest>>

export type ContentFiles = {
	promptPath: string
	explanationPath: string | null
	keys: string[]
}

export type QuestionDerivedInput = {
	questionId: string
	testId: string
	topicId: string
	type: string
	promptText: string
	explanationText?: string | null
	options?: unknown
	matchingPairs?: unknown
}

type TestRow = typeof tests.$inferSelect

type ContentLocation = { topicSlug: string; testSlug: string }

type PointerRow = { prompt_path: string | null; explanation_path: string | null }

type KeyRow = { key: string }

type SlugRow = { slug: string }

export const CONTENT_CHANGED_MESSAGE = 'Содержимое изменилось, повторите'

export const QUESTION_NOT_IN_TEST_MESSAGE = 'Вопрос не найден в текущем тесте'

const ORPHAN_LOG_PREFIX = '[question-content] orphan objects'

const MARKDOWN_WRITE = { contentType: 'text/markdown', upsert: true } as const

export function resolveQuestionPoints(params: {
	type: string
	fallbackPoints: number
	typeMap: Awaited<ReturnType<typeof getQuestionTypeMapForTest>>
}): number {
	const rulePoints = params.typeMap[params.type]?.scoringRule?.correctPoints
	if (typeof rulePoints === 'number' && Number.isFinite(rulePoints) && rulePoints >= 0) {
		return rulePoints
	}
	return params.fallbackPoints
}

async function removeObjects(keys: string[]): Promise<void> {
	if (keys.length === 0) return
	try {
		await storage().remove(keys)
	} catch {
		console.warn(ORPHAN_LOG_PREFIX, keys)
	}
}

async function withCompensation<T>(written: string[], run: () => Promise<T>): Promise<T> {
	try {
		return await run()
	} catch (error) {
		await removeObjects(written)
		throw error
	}
}

export async function writeContentFiles(params: {
	topicSlug: string
	testSlug: string
	questionId: string
	promptText: string
	explanationText?: string | null
}): Promise<ContentFiles> {
	const { topicSlug, testSlug, questionId, promptText, explanationText } = params
	const rev = newRevision()
	const promptPath = contentKey({ topicSlug, testSlug, questionId, kind: 'prompt', rev })
	const explanationPath = explanationText
		? contentKey({ topicSlug, testSlug, questionId, kind: 'explanation', rev })
		: null
	const attempted: string[] = []
	const module = storage()
	try {
		attempted.push(promptPath)
		await module.write(promptPath, promptText, MARKDOWN_WRITE)
		if (explanationPath && explanationText) {
			attempted.push(explanationPath)
			await module.write(explanationPath, explanationText, MARKDOWN_WRITE)
		}
	} catch (error) {
		await removeObjects(attempted)
		throw error
	}
	return { promptPath, explanationPath, keys: attempted }
}

export async function syncQuestionDerived(tx: Tx, input: QuestionDerivedInput): Promise<void> {
	await upsertQuestionSearchDocument(
		{
			questionId: input.questionId,
			testId: input.testId,
			topicId: input.topicId,
			type: input.type,
			promptText: input.promptText,
			options: input.options,
			matchingPairs: input.matchingPairs,
		},
		tx
	)
	await indexQuestionAssets(tx, input.questionId, [input.promptText, input.explanationText])
}

async function readTopicSlug(tx: Tx, topicId: string, share: boolean): Promise<string | null> {
	const result = share
		? await tx.execute<SlugRow>(sql`SELECT slug FROM topics WHERE id = ${topicId} FOR SHARE`)
		: await tx.execute<SlugRow>(sql`SELECT slug FROM topics WHERE id = ${topicId}`)
	return result.rows[0]?.slug ?? null
}

async function lockTestAt(tx: Tx, testId: string, expected: ContentLocation): Promise<LockedTest> {
	const locked = await lockTest(tx, testId)
	const topicSlug = await readTopicSlug(tx, locked.topicId, false)
	if (locked.slug !== expected.testSlug || topicSlug !== expected.topicSlug) {
		throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	}
	return locked
}

async function unreferencedKeys(tx: Tx, keys: string[]): Promise<string[]> {
	const unique = [...new Set(keys)]
	if (unique.length === 0) return []
	const list = sql.join(
		unique.map((key) => sql`${key}`),
		sql`, `
	)
	const result = await tx.execute<KeyRow>(sql`
		SELECT prompt_path AS key FROM questions WHERE prompt_path IN (${list})
		UNION
		SELECT explanation_path AS key FROM questions WHERE explanation_path IN (${list})
	`)
	const used = new Set(result.rows.map((row) => row.key))
	return unique.filter((key) => !used.has(key))
}

async function loadTestAndTopic(testId: string) {
	const test = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
	if (!test) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
	const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
	return { test, topic }
}

async function validateForTest(testId: string, data: QuestionInput): Promise<QuestionTypeMap> {
	const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
	const validationError = validateQuestionWithType(data, typeMap)
	if (validationError) throw new ApiError(400, validationError)
	return typeMap
}

export async function updateQuestion(params: {
	testId: string
	questionId: string
	data: QuestionInput
	userId: string | null
}): Promise<{ questionId: string }> {
	const { testId, questionId, data, userId } = params
	const { test, topic } = await loadTestAndTopic(testId)
	const existing = await db.query.questions.findFirst({
		where: and(eq(questions.id, questionId), eq(questions.testId, testId)),
		columns: { id: true },
	})
	if (!existing) throw new ApiError(404, QUESTION_NOT_IN_TEST_MESSAGE)
	const typeMap = await validateForTest(testId, data)

	const location = { topicSlug: topic.slug, testSlug: test.slug }
	const files = await writeContentFiles({
		...location,
		questionId,
		promptText: data.promptText,
		explanationText: data.explanationText,
	})

	const stale = await withCompensation(files.keys, () =>
		db.transaction(async (tx) => {
			const locked = await lockTestAt(tx, testId, location)
			const pointers = await tx.execute<PointerRow>(sql`
				SELECT prompt_path, explanation_path FROM questions
				WHERE id = ${questionId} AND test_id = ${testId}
				FOR UPDATE
			`)
			const previous = pointers.rows[0]
			if (!previous) throw new ApiError(404, QUESTION_NOT_IN_TEST_MESSAGE)

			const now = new Date()
			await tx
				.update(questions)
				.set({
					type: data.type,
					points: resolveQuestionPoints({
						type: data.type,
						fallbackPoints: Number(data.points ?? 0),
						typeMap,
					}),
					options: data.options ?? null,
					matchingPairs: data.matchingPairs ?? null,
					promptPath: files.promptPath,
					explanationPath: files.explanationPath,
					updatedAt: now,
				})
				.where(eq(questions.id, questionId))

			await tx.update(answerKeys).set({ isActive: false }).where(eq(answerKeys.questionId, questionId))

			const [maxVersion] = await tx
				.select({ maxV: sql<number>`COALESCE(MAX(version), 0)` })
				.from(answerKeys)
				.where(eq(answerKeys.questionId, questionId))

			await tx.insert(answerKeys).values({
				questionId,
				version: (maxVersion?.maxV ?? 0) + 1,
				correctAnswer: data.correct,
				isActive: true,
				createdBy: userId,
			})

			await tx.update(tests).set({ updatedAt: now, updatedBy: userId }).where(eq(tests.id, testId))

			await syncQuestionDerived(tx, {
				questionId,
				testId,
				topicId: locked.topicId,
				type: data.type,
				promptText: data.promptText,
				explanationText: data.explanationText,
				options: data.options,
				matchingPairs: data.matchingPairs,
			})

			const replaced = [previous.prompt_path, previous.explanation_path].filter(
				(key): key is string => typeof key === 'string' && key.length > 0 && !files.keys.includes(key)
			)
			return unreferencedKeys(tx, replaced)
		})
	)

	await removeObjects(stale)
	return { questionId }
}

export async function createQuestion(params: {
	testId: string
	data: QuestionInput
	userId: string | null
}): Promise<{ questionId: string; order: number }> {
	const { testId, data, userId } = params
	const { test, topic } = await loadTestAndTopic(testId)
	const typeMap = await validateForTest(testId, data)

	const questionId = crypto.randomUUID()
	const location = { topicSlug: topic.slug, testSlug: test.slug }
	const files = await writeContentFiles({
		...location,
		questionId,
		promptText: data.promptText,
		explanationText: data.explanationText,
	})

	return withCompensation(files.keys, () =>
		db.transaction(async (tx) => {
			const locked = await lockTestAt(tx, testId, location)
			const [countRow] = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(questions)
				.where(eq(questions.testId, testId))
			const count = Number(countRow?.count ?? 0)
			const position = Math.min(Math.max(data.order ?? count, 0), count)

			const now = new Date()
			await tx.insert(questions).values({
				id: questionId,
				testId,
				type: data.type,
				order: position,
				points: resolveQuestionPoints({
					type: data.type,
					fallbackPoints: Number(data.points ?? 0),
					typeMap,
				}),
				options: data.options ?? null,
				matchingPairs: data.matchingPairs ?? null,
				promptPath: files.promptPath,
				explanationPath: files.explanationPath,
			})

			await tx.insert(answerKeys).values({
				questionId,
				version: 1,
				correctAnswer: data.correct,
				isActive: true,
				createdBy: userId,
			})

			await tx.update(tests).set({ updatedAt: now, updatedBy: userId }).where(eq(tests.id, testId))

			const ordered = await resequenceQuestions(tx, testId, (ids) => insertAt(ids, questionId, position))

			await syncQuestionDerived(tx, {
				questionId,
				testId,
				topicId: locked.topicId,
				type: data.type,
				promptText: data.promptText,
				explanationText: data.explanationText,
				options: data.options,
				matchingPairs: data.matchingPairs,
			})

			return { questionId, order: ordered.indexOf(questionId) }
		})
	)
}

export async function createTestWithQuestions(params: {
	data: TestWithQuestionsInput
	userId: string | null
	typeMap: QuestionTypeMap
}): Promise<{ test: TestRow; topicSlug: string }> {
	const { data, userId, typeMap } = params
	const topic = await db.query.topics.findFirst({ where: eq(topics.id, data.topicId) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
	const existingTest = await db.query.tests.findFirst({
		where: and(eq(tests.topicId, data.topicId), eq(tests.slug, data.slug)),
	})
	if (existingTest) throw new ApiError(409, ERROR_MESSAGES.TEST_SLUG_EXISTS)

	const planned = data.questions.map((question) => ({ question, id: crypto.randomUUID() }))
	const written: string[] = []
	const files = await withCompensation(written, async () => {
		const result: ContentFiles[] = []
		for (const { question, id } of planned) {
			const content = await writeContentFiles({
				topicSlug: topic.slug,
				testSlug: data.slug,
				questionId: id,
				promptText: question.promptText,
				explanationText: question.explanationText,
			})
			written.push(...content.keys)
			result.push(content)
		}
		return result
	})

	const clientOrder = planned
		.map((entry, index) => ({ id: entry.id, order: entry.question.order, index }))
		.sort((a, b) => a.order - b.order || a.index - b.index)
		.map((entry) => entry.id)

	const test = await withCompensation(written, () =>
		db.transaction(async (tx) => {
			const topicSlug = await readTopicSlug(tx, topic.id, true)
			if (topicSlug !== topic.slug) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)

			const [newTest] = await tx
				.insert(tests)
				.values({
					topicId: data.topicId,
					slug: data.slug,
					title: data.title,
					description: data.description,
					isPublished: data.isPublished,
					showCorrectAnswer: data.showCorrectAnswer,
					scoringRules: data.scoringRules ?? null,
					timeLimitMinutes: data.timeLimitMinutes,
					redThresholdMinutes: data.redThresholdMinutes ?? null,
					warningThresholdMinutes: data.warningThresholdMinutes ?? null,
					passingScore: data.passingScore,
					order: data.order,
					version: data.isPublished ? 1 : 0,
					createdBy: userId,
					updatedBy: userId,
				})
				.returning()
			if (!newTest) throw new Error('createTestWithQuestions: test row was not returned')

			for (const [index, { question, id }] of planned.entries()) {
				const content = files[index]
				if (!content) throw new Error('createTestWithQuestions: content files are missing')
				await tx.insert(questions).values({
					id,
					testId: newTest.id,
					type: question.type,
					order: question.order,
					points: resolveQuestionPoints({
						type: question.type,
						fallbackPoints: Number(question.points ?? 0),
						typeMap,
					}),
					options: question.options ?? null,
					matchingPairs: question.matchingPairs ?? null,
					promptPath: content.promptPath,
					explanationPath: content.explanationPath,
				})

				await tx.insert(answerKeys).values({
					questionId: id,
					version: 1,
					correctAnswer: question.correct,
					isActive: true,
					createdBy: userId,
				})

				await syncQuestionDerived(tx, {
					questionId: id,
					testId: newTest.id,
					topicId: topic.id,
					type: question.type,
					promptText: question.promptText,
					explanationText: question.explanationText,
					options: question.options,
					matchingPairs: question.matchingPairs,
				})
			}

			await resequenceQuestions(tx, newTest.id, () => clientOrder)
			return newTest
		})
	)

	return { test, topicSlug: topic.slug }
}
