import { and, eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions, tests, topics } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { ApiError, isUniqueViolation } from '../../lib/errors.js'
import { updateQuestionSearchDocumentLocation } from '../search/question-documents.js'
import { lockTest, resequenceQuestions, type Tx } from './order.js'
import { planRelocation, relocateQuestionObjects, switchPointers } from './relocate.js'
import { CONTENT_CHANGED_MESSAGE, QUESTION_NOT_IN_TEST_MESSAGE } from './write.js'

export const MOVE_FAILED_MESSAGE = 'Не удалось перенести файлы, перенос отменён'

export const MOVE_SAME_TARGET_MESSAGE = 'Выберите другую тему или тест для переноса вопроса'

export type MoveTarget = { topicId: string; topicSlug: string; testId: string; testSlug: string }

type TestRow = typeof tests.$inferSelect

type TopicRow = typeof topics.$inferSelect

type SlugRow = { id: string; slug: string }

type IdRow = { id: string }

type OrderRow = { next: number }

type ResolvedTarget = { topic: TopicRow; test: TestRow | null; slug: string }

async function lockExpected(tx: Tx, test: { id: string; slug: string; topicId: string }): Promise<void> {
	let locked
	try {
		locked = await lockTest(tx, test.id)
	} catch (error) {
		if (error instanceof ApiError && error.statusCode === 404) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
		throw error
	}
	if (locked.slug !== test.slug || locked.topicId !== test.topicId) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
}

async function assertTopicSlugs(tx: Tx, expected: Map<string, string>): Promise<void> {
	const ids = [...expected.keys()].sort()
	const list = sql.join(
		ids.map((id) => sql`${id}::uuid`),
		sql`, `
	)
	const result = await tx.execute<SlugRow>(sql`SELECT id, slug FROM topics WHERE id IN (${list}) ORDER BY id FOR SHARE`)
	const actual = new Map(result.rows.map((row) => [row.id, row.slug]))
	for (const [id, slug] of expected) {
		if (actual.get(id) !== slug) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	}
}

async function freeSlug(topicId: string, base: string): Promise<string> {
	let slug = base
	let suffix = 2
	while (await db.query.tests.findFirst({ where: and(eq(tests.topicId, topicId), eq(tests.slug, slug)) })) {
		slug = `${base}-${suffix}`
		suffix += 1
	}
	return slug
}

async function resolveTarget(params: {
	source: TestRow
	targetTestId?: string
	targetTopicId?: string
}): Promise<ResolvedTarget> {
	const { source, targetTestId, targetTopicId } = params
	const byId = targetTestId ? await db.query.tests.findFirst({ where: eq(tests.id, targetTestId) }) : null
	if (targetTestId && !byId) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
	if (byId) {
		const topic = await db.query.topics.findFirst({ where: eq(topics.id, byId.topicId) })
		if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
		return { topic, test: byId, slug: byId.slug }
	}
	if (!targetTopicId) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)

	const topic = await db.query.topics.findFirst({ where: eq(topics.id, targetTopicId) })
	if (!topic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)
	const sameSlug = await db.query.tests.findFirst({
		where: and(eq(tests.topicId, topic.id), eq(tests.slug, source.slug)),
	})
	if (sameSlug) return { topic, test: sameSlug, slug: sameSlug.slug }
	return { topic, test: null, slug: await freeSlug(topic.id, source.slug) }
}

async function createReceiver(tx: Tx, source: TestRow, topicId: string, slug: string, userId: string | null) {
	const taken = await tx.execute<IdRow>(sql`SELECT id FROM tests WHERE topic_id = ${topicId} AND slug = ${slug}`)
	if (taken.rows.length > 0) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
	const orderRow = await tx.execute<OrderRow>(
		sql`SELECT COALESCE(MAX("order"), -1)::int + 1 AS next FROM tests WHERE topic_id = ${topicId}`
	)
	const [created] = await tx
		.insert(tests)
		.values({
			topicId,
			slug,
			title: source.title,
			description: source.description,
			version: 1,
			isPublished: false,
			showCorrectAnswer: source.showCorrectAnswer,
			scoringRules: source.scoringRules,
			timeLimitMinutes: source.timeLimitMinutes,
			redThresholdMinutes: source.redThresholdMinutes,
			warningThresholdMinutes: source.warningThresholdMinutes,
			passingScore: source.passingScore,
			order: Number(orderRow.rows[0]?.next ?? 0),
			createdBy: userId,
			updatedBy: userId,
		})
		.returning()
	if (!created) throw new Error('moveQuestion: receiver test row was not returned')
	return created
}

export async function moveQuestion(params: {
	sourceTestId: string
	questionId: string
	targetTestId?: string
	targetTopicId?: string
	userId: string | null
}): Promise<{ target: MoveTarget }> {
	const { sourceTestId, questionId, targetTestId, targetTopicId, userId } = params
	const source = await db.query.tests.findFirst({ where: eq(tests.id, sourceTestId) })
	if (!source) throw new ApiError(404, ERROR_MESSAGES.TEST_NOT_FOUND)
	const question = await db.query.questions.findFirst({
		where: and(eq(questions.id, questionId), eq(questions.testId, sourceTestId)),
	})
	if (!question) throw new ApiError(404, QUESTION_NOT_IN_TEST_MESSAGE)
	const sourceTopic = await db.query.topics.findFirst({ where: eq(topics.id, source.topicId) })
	if (!sourceTopic) throw new ApiError(404, ERROR_MESSAGES.TOPIC_NOT_FOUND)

	const target = await resolveTarget({ source, targetTestId, targetTopicId })
	if (target.test?.id === sourceTestId) throw new ApiError(400, MOVE_SAME_TARGET_MESSAGE)

	const plan = await planRelocation(
		[
			{
				id: question.id,
				testId: sourceTestId,
				promptPath: question.promptPath,
				explanationPath: question.explanationPath,
				topicSlug: sourceTopic.slug,
				testSlug: source.slug,
			},
		],
		{ topicSlug: target.topic.slug, testSlug: target.slug }
	)

	const moved = await relocateQuestionObjects(
		plan.pairs,
		async (tx) => {
			const locks = [source, ...(target.test ? [target.test] : [])].sort((a, b) =>
				a.id < b.id ? -1 : a.id > b.id ? 1 : 0
			)
			for (const test of locks) await lockExpected(tx, test)
			await assertTopicSlugs(
				tx,
				new Map([
					[sourceTopic.id, sourceTopic.slug],
					[target.topic.id, target.topic.slug],
				])
			)

			let receiver: TestRow
			try {
				receiver = target.test ?? (await createReceiver(tx, source, target.topic.id, target.slug, userId))
			} catch (error) {
				if (isUniqueViolation(error)) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)
				throw error
			}

			await switchPointers(tx, plan.pointers)
			const relinked = await tx.execute<IdRow>(sql`
				UPDATE questions SET test_id = ${receiver.id}, updated_at = now()
				WHERE id = ${questionId} AND test_id = ${sourceTestId}
				RETURNING id
			`)
			if (relinked.rows.length === 0) throw new ApiError(409, CONTENT_CHANGED_MESSAGE)

			await resequenceQuestions(tx, sourceTestId)
			await resequenceQuestions(tx, receiver.id, (ids) => [...ids.filter((id) => id !== questionId), questionId])
			await updateQuestionSearchDocumentLocation({ questionId, testId: receiver.id, topicId: target.topic.id }, tx)
			return receiver
		},
		{ failureMessage: MOVE_FAILED_MESSAGE }
	)

	return {
		target: { topicId: target.topic.id, topicSlug: target.topic.slug, testId: moved.id, testSlug: moved.slug },
	}
}
