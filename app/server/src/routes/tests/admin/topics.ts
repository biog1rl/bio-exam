import { asc, eq, inArray, sql } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../../db/index.js'
import { tests, topics } from '../../../db/schema.js'
import { ERROR_MESSAGES } from '../../../lib/constants.js'
import { requirePerm } from '../../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { TopicSchema } from '../../../schemas/tests.js'
import {
	canManageCatalog,
	isZoneOwnerCandidate,
	setTopicTeachers,
	testScope,
	topicTeachers,
	zoneOwnerCandidates,
} from '../../../services/access-policy/index.js'
import { deleteTopic, updateTopic } from '../../../services/question-content/index.js'

const router = Router()

const TOPIC_TEACHER_INVALID_ERROR = 'Учитель не найден или не активен'

const TopicTeachersSchema = z.object({
	teacherIds: z
		.array(z.string().uuid())
		.max(50)
		.refine((ids) => new Set(ids).size === ids.length),
})

router.get('/topics', sessionRequired(), requirePerm('tests', 'read'), async (req, res, next) => {
	try {
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) return res.json({ topics: [] })

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
			.where(scope.all ? undefined : inArray(topics.id, scope.topicIds))
			.groupBy(topics.id)
			.orderBy(asc(topics.order), asc(topics.title))

		if (!(await canManageCatalog(req))) return res.json({ topics: rows })

		const teachersByTopic = await topicTeachers(rows.map((row) => row.id))
		return res.json({ topics: rows.map((row) => ({ ...row, teachers: teachersByTopic.get(row.id) ?? [] })) })
	} catch (e) {
		return next(e)
	}
})

router.get('/topics/teacher-options', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
		return res.json({ teachers: await zoneOwnerCandidates() })
	} catch (e) {
		return next(e)
	}
})

router.put('/topics/:id/teachers', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
		const parsed = TopicTeachersSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const id = req.params.id as string
		const topic = await db.query.topics.findFirst({ where: eq(topics.id, id), columns: { id: true } })
		if (!topic) return res.status(404).json({ error: ERROR_MESSAGES.TOPIC_NOT_FOUND })

		const { teacherIds } = parsed.data
		const assignedBy = req.authUser?.id ?? null
		const result = await db.transaction(async (tx) => {
			const current = new Set(((await topicTeachers([id], tx)).get(id) ?? []).map((person) => person.id))
			for (const teacherId of teacherIds) {
				if (current.has(teacherId)) continue
				if (!(await isZoneOwnerCandidate(teacherId, tx))) return null
			}
			await setTopicTeachers(tx, { topicId: id, teacherIds, assignedBy })
			return (await topicTeachers([id], tx)).get(id) ?? []
		})
		if (result === null) return res.status(400).json({ error: TOPIC_TEACHER_INVALID_ERROR })

		return res.json({ teachers: result })
	} catch (e) {
		return next(e)
	}
})

router.post('/topics', sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) return res.status(403).json({ error: 'Forbidden' })
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

router.patch('/topics/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		const id = req.params.id as string
		const parsed = TopicSchema.partial().safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const topic = await updateTopic({ topicId: id, data: parsed.data })

		return res.json({ topic })
	} catch (e) {
		return next(e)
	}
})

router.delete('/topics/:id', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	try {
		if (!(await canManageCatalog(req))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		const id = req.params.id as string

		await deleteTopic({ topicId: id })

		return res.json({ ok: true })
	} catch (e) {
		return next(e)
	}
})

export { router as topicsRouter }
