import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../../db/index.js'
import { questions, tests, topics } from '../../../db/schema.js'
import { requirePerm } from '../../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { testScope } from '../../../services/access-policy/index.js'

const router = Router()

router.get('/', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const topicId = req.query.topicId as string | undefined
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) return res.json({ tests: [] })
		const conditions = [
			...(topicId ? [eq(tests.topicId, topicId)] : []),
			...(scope.all ? [] : [inArray(tests.topicId, scope.topicIds)]),
		]

		// Используем LEFT JOIN с GROUP BY вместо коррелированного подзапроса
		const rows = await db
			.select({
				id: tests.id,
				topicId: tests.topicId,
				slug: tests.slug,
				title: tests.title,
				description: tests.description,
				version: tests.version,
				isPublished: tests.isPublished,
				showCorrectAnswer: tests.showCorrectAnswer,
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
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.groupBy(tests.id, topics.title, topics.slug)
			.orderBy(asc(tests.order), asc(tests.title))

		return res.json({ tests: rows })
	} catch (e) {
		return next(e)
	}
})

export { router as testsListRouter }
