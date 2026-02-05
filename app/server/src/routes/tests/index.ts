/**
 * API роуты для управления тестами
 */
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { answerKeys, questions, tests, topics } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { SaveTestSchema, TopicSchema } from '../../schemas/tests.js'
import { storageService } from '../../services/storage/storage.js'

const router = Router()

// =============================================================================
// Topics
// =============================================================================

// GET /api/tests/topics - список всех тем
router.get('/topics', sessionRequired(), requirePerm('tests', 'read'), async (_req, res, next) => {
	try {
		// Используем LEFT JOIN с GROUP BY вместо коррелированного подзапроса для лучшей производительности
		const rows = await db
			.select({
				id: topics.id,
				slug: topics.slug,
				title: topics.title,
				description: topics.description,
				order: topics.order,
				isActive: topics.isActive,
				createdAt: topics.createdAt,
				testsCount: sql<number>`count(${tests.id})::int`.as('testsCount'),
			})
			.from(topics)
			.leftJoin(tests, eq(tests.topicId, topics.id))
			.groupBy(topics.id)
			.orderBy(asc(topics.order), asc(topics.title))

		res.json({ topics: rows })
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/topics - создать тему
router.post('/topics', sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
		const parsed = TopicSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const userId = req.authUser?.id
		const { slug, title, description, order, isActive } = parsed.data

		// Проверяем уникальность slug
		const existing = await db.query.topics.findFirst({ where: eq(topics.slug, slug) })
		if (existing) {
			return res.status(409).json({ error: ERROR_MESSAGES.TOPIC_SLUG_EXISTS })
		}

		const [inserted] = await db
			.insert(topics)
			.values({
				slug,
				title,
				description,
				order,
				isActive,
				createdBy: userId,
			})
			.returning()

		res.status(201).json({ topic: inserted })
	} catch (e) {
		next(e)
	}
})

// PATCH /api/tests/topics/:id - редактировать тему
router.patch(
	'/topics/:id',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string
			const parsed = TopicSchema.partial().safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const existing = await db.query.topics.findFirst({ where: eq(topics.id, id) })
			if (!existing) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			// Если меняется slug, проверяем уникальность
			if (parsed.data.slug && parsed.data.slug !== existing.slug) {
				const slugExists = await db.query.topics.findFirst({ where: eq(topics.slug, parsed.data.slug) })
				if (slugExists) {
					return res.status(409).json({ error: ERROR_MESSAGES.TOPIC_SLUG_EXISTS })
				}
			}

			const [updated] = await db
				.update(topics)
				.set({
					...parsed.data,
					updatedAt: new Date(),
				})
				.where(eq(topics.id, id))
				.returning()

			res.json({ topic: updated })
		} catch (e) {
			next(e)
		}
	}
)

// DELETE /api/tests/topics/:id - удалить тему
router.delete(
	'/topics/:id',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string

			const existing = await db.query.topics.findFirst({ where: eq(topics.id, id) })
			if (!existing) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			// Удаляем файлы из Storage
			await storageService.deleteDirectory(`topics/${existing.slug}`)

			// Удаляем из БД (каскадно удалятся тесты, вопросы, ответы)
			await db.delete(topics).where(eq(topics.id, id))

			res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

// =============================================================================
// Tests
// =============================================================================

// GET /api/tests - список тестов (с опциональным фильтром по topicId)
router.get('/', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const topicId = req.query.topicId as string | undefined

		// Используем LEFT JOIN с GROUP BY вместо коррелированного подзапроса
		let query = db
			.select({
				id: tests.id,
				topicId: tests.topicId,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				version: tests.version,
				isPublished: tests.isPublished,
				timeLimitMinutes: tests.timeLimitMinutes,
				passingScore: tests.passingScore,
				order: tests.order,
				createdAt: tests.createdAt,
				updatedAt: tests.updatedAt,
				topicTitle: topics.title,
				topicSlug: topics.slug,
				questionsCount: sql<number>`count(${questions.id})::int`.as('questionsCount'),
			})
			.from(tests)
			.leftJoin(topics, eq(tests.topicId, topics.id))
			.leftJoin(questions, eq(questions.testId, tests.id))
			.groupBy(tests.id, topics.title, topics.slug)
			.orderBy(asc(tests.order), asc(tests.title))

		if (topicId) {
			query = query.where(eq(tests.topicId, topicId)) as typeof query
		}

		const rows = await query

		res.json({ tests: rows })
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/by-slug/:topicSlug/:testSlug - загрузить тест по slug
router.get('/by-slug/:topicSlug/:testSlug', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const { topicSlug, testSlug } = req.params

		// Находим тему по slug
		const topic = await db.query.topics.findFirst({
			where: eq(topics.slug, topicSlug),
		})
		if (!topic) {
			return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
		}

		// Находим тест по (topicId, slug)
		const test = await db.query.tests.findFirst({
			where: and(eq(tests.topicId, topic.id), eq(tests.slug, testSlug)),
		})
		if (!test) {
			return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
		}

		// Загружаем вопросы
		const questionRows = await db.select().from(questions).where(eq(questions.testId, test.id)).orderBy(asc(questions.order))

		// Загружаем активные ключи ответов
		const questionIds = questionRows.map((q) => q.id)
		const answerKeyRows =
			questionIds.length > 0
				? await db
						.select()
						.from(answerKeys)
						.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))
				: []

		const answerKeyMap = new Map(answerKeyRows.map((ak) => [ak.questionId, ak.correctAnswer]))

		// Собираем все пути к файлам для чтения
		const filePaths: string[] = []
		const pathToQuestion = new Map<string, { questionId: string; type: 'prompt' | 'explanation' }>()

		for (const q of questionRows) {
			if (q.promptPath) {
				filePaths.push(q.promptPath)
				pathToQuestion.set(q.promptPath, { questionId: q.id, type: 'prompt' })
			}
			if (q.explanationPath) {
				filePaths.push(q.explanationPath)
				pathToQuestion.set(q.explanationPath, { questionId: q.id, type: 'explanation' })
			}
		}

		// Пакетная загрузка файлов из Storage
		const fileContents = await storageService.readFilesParallel(filePaths)

		// Формируем объекты вопросов с текстами
		const questionsWithTexts = questionRows.map((q) => {
			const promptText = q.promptPath ? fileContents.get(q.promptPath) || '' : ''
			const explanationText = q.explanationPath ? fileContents.get(q.explanationPath) || '' : ''
			const correct = answerKeyMap.get(q.id) ?? null

			return {
				id: q.id,
				type: q.type,
				order: q.order,
				points: q.points,
				options: q.options,
				matchingPairs: q.matchingPairs,
				promptText,
				explanationText,
				correct,
			}
		})

		res.json({
			test: {
				...test,
				topicSlug: topic.slug,
				topicTitle: topic.title,
			},
			questions: questionsWithTexts,
		})
	} catch (e) {
		next(e)
	}
})

// GET /api/tests/:id - загрузить тест для редактирования
router.get('/:id', validateUUID('id'), sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const id = req.params.id as string

		// Загружаем тест с темой
		const test = await db.query.tests.findFirst({
			where: eq(tests.id, id),
		})

		if (!test) {
			return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
		}

		const topic = await db.query.topics.findFirst({
			where: eq(topics.id, test.topicId),
		})

		// Загружаем вопросы
		const questionRows = await db.select().from(questions).where(eq(questions.testId, id)).orderBy(asc(questions.order))

		// Загружаем активные ключи ответов
		const questionIds = questionRows.map((q) => q.id)
		const answerKeyRows =
			questionIds.length > 0
				? await db
						.select()
						.from(answerKeys)
						.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))
				: []

		const answerKeyMap = new Map(answerKeyRows.map((ak) => [ak.questionId, ak.correctAnswer]))

		// Собираем все пути к файлам для чтения
		const filePaths: string[] = []
		const pathToQuestion = new Map<string, { questionId: string; type: 'prompt' | 'explanation' }>()

		for (const q of questionRows) {
			if (q.promptPath) {
				filePaths.push(q.promptPath)
				pathToQuestion.set(q.promptPath, { questionId: q.id, type: 'prompt' })
			}
			if (q.explanationPath) {
				filePaths.push(q.explanationPath)
				pathToQuestion.set(q.explanationPath, { questionId: q.id, type: 'explanation' })
			}
		}

		// Пакетная загрузка файлов из Storage с лимитом параллелизма
		const fileContents = await storageService.readFilesParallel(filePaths)

		// Формируем объекты вопросов с текстами
		const questionsWithTexts = questionRows.map((q) => {
			const promptText = q.promptPath ? fileContents.get(q.promptPath) || '' : ''
			const explanationText = q.explanationPath ? fileContents.get(q.explanationPath) || '' : ''
			const correct = answerKeyMap.get(q.id) ?? null

			return {
				id: q.id,
				type: q.type,
				order: q.order,
				points: q.points,
				options: q.options,
				matchingPairs: q.matchingPairs,
				promptText,
				explanationText,
				correct,
			}
		})

		res.json({
			test: {
				...test,
				topicSlug: topic?.slug,
				topicTitle: topic?.title,
			},
			questions: questionsWithTexts,
		})
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/save - создать новый тест
router.post('/save', sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
		const parsed = SaveTestSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const userId = req.authUser?.id
		const data = parsed.data

		// Получаем тему для slug
		const topic = await db.query.topics.findFirst({ where: eq(topics.id, data.topicId) })
		if (!topic) {
			return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
		}

		// Проверяем уникальность slug в рамках темы
		const existingTest = await db.query.tests.findFirst({
			where: and(eq(tests.topicId, data.topicId), eq(tests.slug, data.slug)),
		})
		if (existingTest) {
			return res.status(409).json({ error: ERROR_MESSAGES.TEST_SLUG_EXISTS })
		}

		// Начинаем транзакцию
		const result = await db.transaction(async (tx) => {
			// Создаём тест
			const [newTest] = await tx
				.insert(tests)
				.values({
					topicId: data.topicId,
					slug: data.slug,
					title: data.title,
					description: data.description,
					isPublished: data.isPublished,
					timeLimitMinutes: data.timeLimitMinutes,
					passingScore: data.passingScore,
					order: data.order,
					version: data.isPublished ? 1 : 0,
					createdBy: userId,
					updatedBy: userId,
				})
				.returning()

			// Создаём вопросы
			const createdQuestions = []
			for (const q of data.questions) {
				const [newQuestion] = await tx
					.insert(questions)
					.values({
						testId: newTest.id,
						type: q.type,
						order: q.order,
						points: q.points,
						options: q.options ?? null,
						matchingPairs: q.matchingPairs ?? null,
						promptPath: `topics/${topic.slug}/${data.slug}/questions/${crypto.randomUUID()}/prompt.md`,
						explanationPath: q.explanationText
							? `topics/${topic.slug}/${data.slug}/questions/${crypto.randomUUID()}/explanation.md`
							: null,
					})
					.returning()

				// Обновляем пути с реальным ID
				const promptPath = storageService.getQuestionPath(topic.slug, data.slug, newQuestion.id) + '/prompt.md'
				const explanationPath = q.explanationText
					? storageService.getQuestionPath(topic.slug, data.slug, newQuestion.id) + '/explanation.md'
					: null

				await tx.update(questions).set({ promptPath, explanationPath }).where(eq(questions.id, newQuestion.id))

				// Создаём ключ ответа
				await tx.insert(answerKeys).values({
					questionId: newQuestion.id,
					version: 1,
					correctAnswer: q.correct,
					isActive: true,
					createdBy: userId,
				})

				createdQuestions.push({
					...newQuestion,
					promptPath,
					explanationPath,
					promptText: q.promptText,
					explanationText: q.explanationText,
				})
			}

			return { test: newTest, questions: createdQuestions }
		})

		// Записываем файлы в Storage (после успешной транзакции)
		for (const q of result.questions) {
			if (q.promptPath && q.promptText) {
				await storageService.writeFile(q.promptPath, q.promptText)
			}
			if (q.explanationPath && q.explanationText) {
				await storageService.writeFile(q.explanationPath, q.explanationText)
			}
		}

		// Записываем settings.json
		const testPath = storageService.getTestPath(topic.slug, data.slug)
		await storageService.writeJson(`${testPath}/settings.json`, {
			id: result.test.id,
			title: data.title,
			description: data.description,
			isPublished: data.isPublished,
			timeLimitMinutes: data.timeLimitMinutes,
			passingScore: data.passingScore,
			version: result.test.version,
			updatedAt: new Date().toISOString(),
		})

		res.status(201).json({ test: { ...result.test, topicSlug: topic.slug } })
	} catch (e) {
		next(e)
	}
})

// POST /api/tests/:id/save - обновить существующий тест
router.post(
	'/:id/save',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'write'),
	async (req, res, next) => {
		try {
			const testId = req.params.id as string
			const parsed = SaveTestSchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			}

			const userId = req.authUser?.id
			const data = parsed.data

			// Проверяем существование теста
			const existingTest = await db.query.tests.findFirst({ where: eq(tests.id, testId) })
			if (!existingTest) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}

			// Получаем тему
			const topic = await db.query.topics.findFirst({ where: eq(topics.id, data.topicId) })
			if (!topic) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			// Проверяем уникальность slug (если изменился)
			if (data.slug !== existingTest.slug || data.topicId !== existingTest.topicId) {
				const slugExists = await db.query.tests.findFirst({
					where: and(eq(tests.topicId, data.topicId), eq(tests.slug, data.slug)),
				})
				if (slugExists && slugExists.id !== testId) {
					return res.status(409).json({ error: ERROR_MESSAGES.TEST_SLUG_EXISTS })
				}
			}

			// Определяем, нужно ли инкрементировать версию
			const shouldIncrementVersion = data.isPublished && !existingTest.isPublished

			// Получаем старые данные для очистки Storage
			const oldTopic = await db.query.topics.findFirst({ where: eq(topics.id, existingTest.topicId) })
			const oldQuestions = await db.select().from(questions).where(eq(questions.testId, testId))

			// Начинаем транзакцию
			const result = await db.transaction(async (tx) => {
				// Обновляем тест
				const [updatedTest] = await tx
					.update(tests)
					.set({
						topicId: data.topicId,
						slug: data.slug,
						title: data.title,
						description: data.description,
						isPublished: data.isPublished,
						timeLimitMinutes: data.timeLimitMinutes,
						passingScore: data.passingScore,
						order: data.order,
						version: shouldIncrementVersion ? existingTest.version + 1 : existingTest.version,
						updatedAt: new Date(),
						updatedBy: userId,
					})
					.where(eq(tests.id, testId))
					.returning()

				// Определяем какие вопросы удалить, обновить, создать
				const existingQuestionIds = new Set(oldQuestions.map((q) => q.id))
				const incomingQuestionIds = new Set(data.questions.filter((q) => q.id).map((q) => q.id!))

				// Удаляем вопросы, которых нет в новых данных
				const toDelete = oldQuestions.filter((q) => !incomingQuestionIds.has(q.id))
				if (toDelete.length > 0) {
					await tx.delete(questions).where(
						inArray(
							questions.id,
							toDelete.map((q) => q.id)
						)
					)
				}

				// Обновляем/создаём вопросы
				const updatedQuestions = []
				for (const q of data.questions) {
					if (q.id && existingQuestionIds.has(q.id)) {
						// Обновляем существующий вопрос
						const existingQ = oldQuestions.find((oq) => oq.id === q.id)!
						const promptPath = storageService.getQuestionPath(topic.slug, data.slug, q.id) + '/prompt.md'
						const explanationPath = q.explanationText
							? storageService.getQuestionPath(topic.slug, data.slug, q.id) + '/explanation.md'
							: null

						await tx
							.update(questions)
							.set({
								type: q.type,
								order: q.order,
								points: q.points,
								options: q.options ?? null,
								matchingPairs: q.matchingPairs ?? null,
								promptPath,
								explanationPath,
								updatedAt: new Date(),
							})
							.where(eq(questions.id, q.id))

						// Деактивируем старые ключи и создаём новый
						await tx.update(answerKeys).set({ isActive: false }).where(eq(answerKeys.questionId, q.id))

						const maxVersion = await tx
							.select({ maxV: sql<number>`COALESCE(MAX(version), 0)` })
							.from(answerKeys)
							.where(eq(answerKeys.questionId, q.id))

						await tx.insert(answerKeys).values({
							questionId: q.id,
							version: (maxVersion[0]?.maxV ?? 0) + 1,
							correctAnswer: q.correct,
							isActive: true,
							createdBy: userId,
						})

						updatedQuestions.push({
							id: q.id,
							promptPath,
							explanationPath,
							promptText: q.promptText,
							explanationText: q.explanationText,
							oldPromptPath: existingQ.promptPath,
							oldExplanationPath: existingQ.explanationPath,
						})
					} else {
						// Создаём новый вопрос
						const [newQuestion] = await tx
							.insert(questions)
							.values({
								testId,
								type: q.type,
								order: q.order,
								points: q.points,
								options: q.options ?? null,
								matchingPairs: q.matchingPairs ?? null,
							})
							.returning()

						const promptPath = storageService.getQuestionPath(topic.slug, data.slug, newQuestion.id) + '/prompt.md'
						const explanationPath = q.explanationText
							? storageService.getQuestionPath(topic.slug, data.slug, newQuestion.id) + '/explanation.md'
							: null

						await tx.update(questions).set({ promptPath, explanationPath }).where(eq(questions.id, newQuestion.id))

						await tx.insert(answerKeys).values({
							questionId: newQuestion.id,
							version: 1,
							correctAnswer: q.correct,
							isActive: true,
							createdBy: userId,
						})

						updatedQuestions.push({
							id: newQuestion.id,
							promptPath,
							explanationPath,
							promptText: q.promptText,
							explanationText: q.explanationText,
							oldPromptPath: null,
							oldExplanationPath: null,
						})
					}
				}

				return { test: updatedTest, questions: updatedQuestions, toDelete }
			})

			// Очищаем старые файлы удалённых вопросов
			const filesToDelete: string[] = []
			for (const q of result.toDelete) {
				if (q.promptPath) filesToDelete.push(q.promptPath)
				if (q.explanationPath) filesToDelete.push(q.explanationPath)
			}
			if (filesToDelete.length > 0) {
				await storageService.deleteFiles(filesToDelete)
			}

			// Записываем новые файлы
			for (const q of result.questions) {
				// Удаляем старые файлы если путь изменился
				if (q.oldPromptPath && q.oldPromptPath !== q.promptPath) {
					await storageService.deleteFiles([q.oldPromptPath])
				}
				if (q.oldExplanationPath && q.oldExplanationPath !== q.explanationPath) {
					await storageService.deleteFiles([q.oldExplanationPath])
				}

				// Записываем новые
				if (q.promptPath && q.promptText) {
					await storageService.writeFile(q.promptPath, q.promptText)
				}
				if (q.explanationPath && q.explanationText) {
					await storageService.writeFile(q.explanationPath, q.explanationText)
				}
			}

			// Обновляем settings.json
			const testPath = storageService.getTestPath(topic.slug, data.slug)
			await storageService.writeJson(`${testPath}/settings.json`, {
				id: result.test.id,
				title: data.title,
				description: data.description,
				isPublished: data.isPublished,
				timeLimitMinutes: data.timeLimitMinutes,
				passingScore: data.passingScore,
				version: result.test.version,
				updatedAt: new Date().toISOString(),
			})

			res.json({ test: { ...result.test, topicSlug: topic.slug } })
		} catch (e) {
			next(e)
		}
	}
)

// DELETE /api/tests/:id - удалить тест
router.delete('/:id', validateUUID('id'), sessionRequired(), requirePerm('tests', 'write'), async (req, res, next) => {
	try {
		const id = req.params.id as string

		const test = await db.query.tests.findFirst({ where: eq(tests.id, id) })
		if (!test) {
			return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
		}

		const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })

		// Удаляем файлы из Storage
		if (topic) {
			const testPath = storageService.getTestPath(topic.slug, test.slug)
			await storageService.deleteDirectory(testPath)
		}

		// Удаляем из БД
		await db.delete(tests).where(eq(tests.id, id))

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// =============================================================================
// Export
// =============================================================================

// GET /api/tests/:id/export - экспорт теста в ZIP
router.get(
	'/:id/export',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('tests', 'read'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string
			const withAnswers = req.query.withAnswers === 'true'

			const test = await db.query.tests.findFirst({ where: eq(tests.id, id) })
			if (!test) {
				return res.status(404).json({ error: ERROR_MESSAGES.TEST_NOT_FOUND })
			}

			const topic = await db.query.topics.findFirst({ where: eq(topics.id, test.topicId) })
			if (!topic) {
				return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
			}

			// Если нужны ответы, сначала записываем их в Storage
			if (withAnswers) {
				const questionRows = await db.select().from(questions).where(eq(questions.testId, id))
				const questionIds = questionRows.map((q) => q.id)

				if (questionIds.length > 0) {
					const answerKeyRows = await db
						.select()
						.from(answerKeys)
						.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))

					const answersData = answerKeyRows.map((ak) => ({
						questionId: ak.questionId,
						correct: ak.correctAnswer,
					}))

					const testPath = storageService.getTestPath(topic.slug, test.slug)
					await storageService.writeJson(`${testPath}/answer_keys.json`, answersData)
				}
			}

			const testPath = storageService.getTestPath(topic.slug, test.slug)
			const zipBuffer = await storageService.createZip(testPath, withAnswers)

			res.setHeader('Content-Type', 'application/zip')
			res.setHeader('Content-Disposition', `attachment; filename="${topic.slug}-${test.slug}.zip"`)
			res.send(zipBuffer)
		} catch (e) {
			next(e)
		}
	}
)

// GET /api/tests/topics/:slug/export - экспорт темы в ZIP
router.get('/topics/:slug/export', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const slug = req.params.slug as string
		const withAnswers = req.query.withAnswers === 'true'

		const topic = await db.query.topics.findFirst({ where: eq(topics.slug, slug) })
		if (!topic) {
			return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })
		}

		// Если нужны ответы, записываем их для каждого теста
		if (withAnswers) {
			const topicTests = await db.select().from(tests).where(eq(tests.topicId, topic.id))

			for (const test of topicTests) {
				const questionRows = await db.select().from(questions).where(eq(questions.testId, test.id))
				const questionIds = questionRows.map((q) => q.id)

				if (questionIds.length > 0) {
					const answerKeyRows = await db
						.select()
						.from(answerKeys)
						.where(and(inArray(answerKeys.questionId, questionIds), eq(answerKeys.isActive, true)))

					const answersData = answerKeyRows.map((ak) => ({
						questionId: ak.questionId,
						correct: ak.correctAnswer,
					}))

					const testPath = storageService.getTestPath(topic.slug, test.slug)
					await storageService.writeJson(`${testPath}/answer_keys.json`, answersData)
				}
			}
		}

		const topicPath = `topics/${topic.slug}`
		const zipBuffer = await storageService.createZip(topicPath, withAnswers)

		res.setHeader('Content-Type', 'application/zip')
		res.setHeader('Content-Disposition', `attachment; filename="${topic.slug}.zip"`)
		res.send(zipBuffer)
	} catch (e) {
		next(e)
	}
})

export default router
