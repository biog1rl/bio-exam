import { and, eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { testAssignments, userGroups, users } from '../../db/schema.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { AssignUserSchema } from '../../schemas/assignments.js'

export const assignmentsRouter = Router({ mergeParams: true })

// GET /api/tests/:testId/assignments — list users assigned to this test
assignmentsRouter.get(
	'/',
	validateUUID('testId'),
	sessionRequired(),
	requirePerm('tests', 'manage_assignments'),
	async (req, res, next) => {
		try {
			const { testId } = req.params as { testId: string }
			const rows = await db
				.select({
					userId: testAssignments.userId,
					assignedAt: testAssignments.assignedAt,
					name: users.name,
					login: users.login,
				})
				.from(testAssignments)
				.innerJoin(users, eq(users.id, testAssignments.userId))
				.where(eq(testAssignments.testId, testId))
			res.json({ assignments: rows })
		} catch (err) {
			next(err)
		}
	}
)

// POST /api/tests/:testId/assignments — assign a user to this test
assignmentsRouter.post(
	'/',
	validateUUID('testId'),
	sessionRequired(),
	requirePerm('tests', 'manage_assignments'),
	async (req, res, next) => {
		try {
			const { testId } = req.params as { testId: string }
			const parsed = AssignUserSchema.safeParse(req.body)
			if (!parsed.success) {
				res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
				return
			}
			const { userId } = parsed.data
			const adminId = req.authUser!.id
			await db
				.insert(testAssignments)
				.values({ testId, userId, assignedBy: adminId })
				.onConflictDoNothing()
			res.json({ ok: true })
		} catch (err) {
			next(err)
		}
	}
)

// POST /api/tests/:testId/assignments/group/:groupId — bulk assignment для всей группы
assignmentsRouter.post(
	'/group/:groupId',
	validateUUID('testId'),
	validateUUID('groupId'),
	sessionRequired(),
	requirePerm('tests', 'manage_assignments'),
	async (req, res, next) => {
		try {
			const { testId, groupId } = req.params as { testId: string; groupId: string }
			const adminId = req.authUser!.id

			const members = await db
				.select({ userId: userGroups.userId })
				.from(userGroups)
				.where(eq(userGroups.groupId, groupId))

			if (members.length === 0) {
				res.json({ ok: true, assigned: 0 })
				return
			}

			const inserted = await db
				.insert(testAssignments)
				.values(members.map(({ userId }) => ({ testId, userId, assignedBy: adminId })))
				.onConflictDoNothing()
				.returning({ id: testAssignments.userId })

			res.json({ ok: true, assigned: inserted.length })
		} catch (err) {
			next(err)
		}
	}
)

// DELETE /api/tests/:testId/assignments/:userId — remove a user from this test
assignmentsRouter.delete(
	'/:userId',
	validateUUID('testId'),
	validateUUID('userId'),
	sessionRequired(),
	requirePerm('tests', 'manage_assignments'),
	async (req, res, next) => {
		try {
			const { testId, userId } = req.params as { testId: string; userId: string }
			await db
				.delete(testAssignments)
				.where(and(eq(testAssignments.testId, testId), eq(testAssignments.userId, userId)))
			res.json({ ok: true })
		} catch (err) {
			next(err)
		}
	}
)
