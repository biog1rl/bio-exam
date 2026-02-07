/**
 * Публичные API роуты для прохождения тестов (для студентов)
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { answerKeys, questions, testAttempts, tests, topics } from '../../db/schema.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { storageService } from '../../services/storage/storage.js'

const router = Router()

// =============================================================================
// Zod Schemas
// =============================================================================

const SubmitAnswerValueSchema = z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])

const SubmitAnswersSchema = z.object({
	answers: z.record(z.string().uuid(), SubmitAnswerValueSchema), // questionId -> answer
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// =============================================================================
// Helpers
// =============================================================================

function isStringRecord(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	return Object.entries(value).every(([k, v]) => typeof k === 'string' && typeof v === 'string')
}

function normalizeStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null
	return [...value].sort()
}

function isMatchingEqual(userAnswer: unknown, correctAnswer: unknown): boolean {
	if (!isStringRecord(userAnswer) || !isStringRecord(correctAnswer)) return false

	const userKeys = Object.keys(userAnswer).sort()
	const correctKeys = Object.keys(correctAnswer).sort()
	if (userKeys.length !== correctKeys.length) return false
	if (userKeys.join('|') !== correctKeys.join('|')) return false

	return userKeys.every((key) => userAnswer[key] === correctAnswer[key])
}

function buildQuestionMarkdownCandidates(params: {
	storedPath: string | null
	topicSlug: string
	testSlug: string
	testId: string
	questionId: string
	fileName: 'prompt.md' | 'explanation.md'
}): string[] {
	const { storedPath, topicSlug, testSlug, testId, questionId, fileName } = params

	// Current canonical path:
	// topics/{topicSlug}/{testSlug}/questions/{questionId}/{fileName}
	//
	// Backward-compatible fallbacks:
	// - questions/{testId}/{fileName}
	// - {testId} used as test folder
	const candidates = [
		storedPath,
		`topics/${topicSlug}/${testSlug}/questions/${questionId}/${fileName}`,
		`topics/${topicSlug}/${testSlug}/questions/${testId}/${fileName}`,
		`topics/${topicSlug}/${testId}/questions/${questionId}/${fileName}`,
		`topics/${topicSlug}/${testId}/questions/${testId}/${fileName}`,
	].filter((value): value is string => typeof value === 'string' && value.length > 0)

	return [...new Set(candidates)]
}

async function readFirstMarkdown(candidates: string[]): Promise<string> {
	for (const candidate of candidates) {
		const content = await storageService.readFile(candidate)
		if (content.trim().length > 0) {
			return content
		}
	}
	return ''
}

// =============================================================================
// Endpoints
// =============================================================================

// GET /api/tests/public/topics - список активных тем
router.get('/topics', async (_req, res, next) => {
	try {
		const rows = await db
			.select({
				id: topics.id,
				slug: topics.slug,
				title: topics.title,
				description: topics.description,
			})
			.from(topics)
			.where(eq(topics.isActive, true))
			.orderBy(asc(topics.order), asc(topics.title))

		res.json({ topics: rows })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/tests - список всех опубликованных тестов в активных темах
router.get('/tests', async (_req, res, next) => {
	try {
		const rows = await db
			.select({
				id: tests.id,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				showCorrectAnswer: tests.showCorrectAnswer,
				timeLimitMinutes: tests.timeLimitMinutes,
				passingScore: tests.passingScore,
				topicId: topics.id,
				topicSlug: topics.slug,
				topicTitle: topics.title,
				questionsCount: sql<number>`count(${questions.id})::int`.as('questionsCount'),
			})
			.from(tests)
			.innerJoin(topics, and(eq(tests.topicId, topics.id), eq(topics.isActive, true)))
			.leftJoin(questions, eq(questions.testId, tests.id))
			.where(eq(tests.isPublished, true))
			.groupBy(tests.id, topics.id, topics.slug, topics.title)
			.orderBy(asc(topics.order), asc(topics.title), asc(tests.order), asc(tests.title))

		res.json({ tests: rows })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/topics/:slug/tests - список опубликованных тестов в теме
router.get('/topics/:slug/tests', async (req, res, next) => {
	try {
		const { slug } = req.params as { slug: string }

		const topic = await db.query.topics.findFirst({
			where: and(eq(topics.slug, slug), eq(topics.isActive, true)),
		})

		if (!topic) {
			return res.status(404).json({ error: 'Topic not found' })
		}

		const rows = await db
			.select({
				id: tests.id,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				timeLimitMinutes: tests.timeLimitMinutes,
				passingScore: tests.passingScore,
				questionsCount: sql<number>`count(${questions.id})::int`.as('questionsCount'),
			})
			.from(tests)
			.leftJoin(questions, eq(questions.testId, tests.id))
			.where(and(eq(tests.topicId, topic.id), eq(tests.isPublished, true)))
			.groupBy(tests.id)
			.orderBy(asc(tests.order), asc(tests.title))

		res.json({ tests: rows, topicTitle: topic.title })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/topics/:topicSlug/tests/:testSlug - получить тест по slug темы и slug теста
router.get('/topics/:topicSlug/tests/:testSlug', async (req, res, next) => {
	try {
		const { topicSlug, testSlug } = req.params as { topicSlug: string; testSlug: string }

		const testRows = await db
			.select({
				id: tests.id,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				timeLimitMinutes: tests.timeLimitMinutes,
				passingScore: tests.passingScore,
				topicId: topics.id,
				topicSlug: topics.slug,
				topicTitle: topics.title,
			})
			.from(tests)
			.innerJoin(topics, eq(tests.topicId, topics.id))
			.where(
				and(
					eq(topics.slug, topicSlug),
					eq(topics.isActive, true),
					eq(tests.slug, testSlug),
					eq(tests.isPublished, true)
				)
			)
			.limit(1)
		let test = testRows[0]
		if (!test && UUID_RE.test(testSlug)) {
			const fallbackRows = await db
				.select({
					id: tests.id,
					slug: tests.slug,
					title: tests.title,
					description: tests.description,
					showCorrectAnswer: tests.showCorrectAnswer,
					timeLimitMinutes: tests.timeLimitMinutes,
					passingScore: tests.passingScore,
					topicId: topics.id,
					topicSlug: topics.slug,
					topicTitle: topics.title,
				})
				.from(tests)
				.innerJoin(topics, eq(tests.topicId, topics.id))
				.where(
					and(
						eq(topics.slug, topicSlug),
						eq(topics.isActive, true),
						eq(tests.id, testSlug),
						eq(tests.isPublished, true)
					)
				)
				.limit(1)
			test = fallbackRows[0]
		}
		if (!test) {
			return res.status(404).json({ error: 'Test not found' })
		}

		const questionRows = await db
			.select({
				id: questions.id,
				type: questions.type,
				order: questions.order,
				points: questions.points,
				options: questions.options,
				matchingPairs: questions.matchingPairs,
				promptPath: questions.promptPath,
			})
			.from(questions)
			.where(eq(questions.testId, test.id))
			.orderBy(asc(questions.order))

		const questionsWithTexts = await Promise.all(
			questionRows.map(async (q) => {
				const promptCandidates = buildQuestionMarkdownCandidates({
					storedPath: q.promptPath,
					topicSlug: test.topicSlug,
					testSlug: test.slug,
					testId: test.id,
					questionId: q.id,
					fileName: 'prompt.md',
				})

				const promptText = await readFirstMarkdown(promptCandidates)
				return {
					id: q.id,
					type: q.type,
					order: q.order,
					points: q.points,
					options: q.options,
					matchingPairs: q.matchingPairs,
					promptText,
				}
			})
		)

		res.json({
			test,
			questions: questionsWithTexts,
		})
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/tests/:id - получить тест и вопросы (БЕЗ ОТВЕТОВ)
router.get('/tests/:id', validateUUID('id'), async (req, res, next) => {
	try {
		const testId = req.params.id as string

		const testRows = await db
			.select({
				id: tests.id,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				showCorrectAnswer: tests.showCorrectAnswer,
				timeLimitMinutes: tests.timeLimitMinutes,
				passingScore: tests.passingScore,
				topicId: topics.id,
				topicSlug: topics.slug,
				topicTitle: topics.title,
			})
			.from(tests)
			.innerJoin(topics, eq(tests.topicId, topics.id))
			.where(and(eq(tests.id, testId), eq(tests.isPublished, true), eq(topics.isActive, true)))
			.limit(1)

		const test = testRows[0]
		if (!test) {
			return res.status(404).json({ error: 'Test not found' })
		}

		const questionRows = await db
			.select({
				id: questions.id,
				type: questions.type,
				order: questions.order,
				points: questions.points,
				options: questions.options,
				matchingPairs: questions.matchingPairs,
				promptPath: questions.promptPath,
			})
			.from(questions)
			.where(eq(questions.testId, test.id))
			.orderBy(asc(questions.order))

		const questionsWithTexts = await Promise.all(
			questionRows.map(async (q) => {
				const promptCandidates = buildQuestionMarkdownCandidates({
					storedPath: q.promptPath,
					topicSlug: test.topicSlug,
					testSlug: test.slug,
					testId: test.id,
					questionId: q.id,
					fileName: 'prompt.md',
				})

				const promptText = await readFirstMarkdown(promptCandidates)
				return {
					id: q.id,
					type: q.type,
					order: q.order,
					points: q.points,
					options: q.options,
					matchingPairs: q.matchingPairs,
					promptText,
				}
			})
		)

		res.json({
			test,
			questions: questionsWithTexts,
		})
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/public/tests/:id/attempts/me - история попыток текущего пользователя
router.get('/tests/:id/attempts/me', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser?.id
		if (!userId) return res.status(401).json({ error: 'Unauthorized' })

		const attempts = await db
			.select({
				id: testAttempts.id,
				earnedPoints: testAttempts.earnedPoints,
				totalPoints: testAttempts.totalPoints,
				scorePercentage: testAttempts.scorePercentage,
				passed: testAttempts.passed,
				submittedAt: testAttempts.submittedAt,
			})
			.from(testAttempts)
			.where(and(eq(testAttempts.testId, testId), eq(testAttempts.userId, userId)))
			.orderBy(desc(testAttempts.submittedAt))
			.limit(20)

		res.json({ attempts })
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/public/tests/:id/submit - проверить ответы, сохранить попытку, вернуть результат
router.post('/tests/:id/submit', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		const testId = req.params.id as string
		const userId = req.authUser?.id
		if (!userId) return res.status(401).json({ error: 'Unauthorized' })

		const parsed = SubmitAnswersSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		}

		const userAnswers = parsed.data.answers

		const testRows = await db
			.select({
				id: tests.id,
				slug: tests.slug,
				topicSlug: topics.slug,
				passingScore: tests.passingScore,
				showCorrectAnswer: tests.showCorrectAnswer,
			})
			.from(tests)
			.innerJoin(topics, eq(tests.topicId, topics.id))
			.where(and(eq(tests.id, testId), eq(tests.isPublished, true), eq(topics.isActive, true)))
			.limit(1)

		const test = testRows[0]
		if (!test) {
			return res.status(404).json({ error: 'Test not found' })
		}

		const questionRows = await db.select().from(questions).where(eq(questions.testId, test.id))
		const questionIds = questionRows.map((q) => q.id)
		if (questionIds.length === 0) {
			return res.status(404).json({ error: 'Questions not found' })
		}

		const correctAnswers = await db
			.select()
			.from(answerKeys)
			.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))

		const correctAnswersMap = new Map(correctAnswers.map((ak) => [ak.questionId, ak.correctAnswer]))

		let totalPoints = 0
		let earnedPoints = 0
		const results: Array<{
			questionId: string
			isCorrect: boolean
			points: number
			earnedPoints: number
			userAnswer: unknown
			correctAnswer: unknown
			explanationText: string | null
		}> = []

		for (const q of questionRows) {
			const correctAnswer = correctAnswersMap.get(q.id)
			const userAnswer = userAnswers[q.id] ?? null
			const points = Number(q.points ?? 0)
			let isCorrect = false

			totalPoints += points

			if (q.type === 'radio') {
				isCorrect = typeof userAnswer === 'string' && typeof correctAnswer === 'string' && userAnswer === correctAnswer
			} else if (q.type === 'checkbox') {
				const normalizedUser = normalizeStringArray(userAnswer)
				const normalizedCorrect = normalizeStringArray(correctAnswer)
				isCorrect =
					normalizedUser !== null &&
					normalizedCorrect !== null &&
					normalizedUser.join('|') === normalizedCorrect.join('|')
			} else if (q.type === 'matching') {
				isCorrect = isMatchingEqual(userAnswer, correctAnswer)
			}

			const questionEarnedPoints = isCorrect ? points : 0
			if (isCorrect) earnedPoints += points

			const explanationCandidates = buildQuestionMarkdownCandidates({
				storedPath: q.explanationPath,
				topicSlug: test.topicSlug,
				testSlug: test.slug,
				testId: test.id,
				questionId: q.id,
				fileName: 'explanation.md',
			})
			const explanationText = (await readFirstMarkdown(explanationCandidates)) || null

			results.push({
				questionId: q.id,
				isCorrect,
				points,
				earnedPoints: questionEarnedPoints,
				userAnswer,
				correctAnswer: isCorrect || !test.showCorrectAnswer ? null : correctAnswer,
				explanationText,
			})
		}

		const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
		const passed = test.passingScore == null ? true : scorePercentage >= Number(test.passingScore)

		const [attempt] = await db
			.insert(testAttempts)
			.values({
				testId: test.id,
				userId,
				answers: userAnswers,
				results,
				earnedPoints,
				totalPoints,
				scorePercentage,
				passed,
			})
			.returning({
				id: testAttempts.id,
				submittedAt: testAttempts.submittedAt,
			})

		res.json({
			attemptId: attempt.id,
			submittedAt: attempt.submittedAt,
			earnedPoints,
			totalPoints,
			scorePercentage,
			passed,
			results,
		})
	} catch (e) {
		next(e)
	}
})

export default router
