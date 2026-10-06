import { and, eq, inArray } from 'drizzle-orm'
import { Router, type Request } from 'express'

import { db } from '../../db/index.js'
import { testAssignments, userGroups, users } from '../../db/schema.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { AssignUserSchema } from '../../schemas/assignments.js'
import {
	canAssign,
	canAssignMany,
	canManageGroup,
	canReadTest,
	canWriteTest,
	hasGlobalZone,
	hasPermission,
	userScope,
} from '../../services/access-policy/index.js'
import { recordTestAssigned } from '../../services/notifications/index.js'

export const assignmentsRouter = Router({ mergeParams: true })

export async function removeAssignment(req: Request, testId: string, userId: string): Promise<boolean> {
	if (!(await canAssign(req, testId, userId))) return false
	const [row] = await db
		.select({ assignedBy: testAssignments.assignedBy })
		.from(testAssignments)
		.where(and(eq(testAssignments.testId, testId), eq(testAssignments.userId, userId)))
		.limit(1)
	if (!row) return true
	const requesterId = req.authUser!.id
	const global = await hasGlobalZone(req)
	if (!global && row.assignedBy !== requesterId) return false
	await db
		.delete(testAssignments)
		.where(
			and(
				eq(testAssignments.testId, testId),
				eq(testAssignments.userId, userId),
				global ? undefined : eq(testAssignments.assignedBy, requesterId)
			)
		)
	return true
}

export async function addAssignments(
	testId: string,
	userIds: readonly string[],
	assignedBy: string
): Promise<string[]> {
	if (userIds.length === 0) return []
	const ids = [...new Set(userIds)].sort()
	return db.transaction(async (tx) => {
		const rows = await tx
			.insert(testAssignments)
			.values(ids.map((userId) => ({ testId, userId, assignedBy })))
			.onConflictDoNothing()
			.returning({ userId: testAssignments.userId })
		const inserted = rows.map((row) => row.userId)
		await recordTestAssigned(tx, { testId, actorId: assignedBy, recipientIds: inserted })
		return inserted
	})
}

async function memberIdsInScope(req: Request, userIds: string[]): Promise<(userId: string) => boolean> {
	const scope = await userScope(req)
	if (scope.all) return () => true
	if (scope.groupIds.length === 0 || userIds.length === 0) return () => false
	const rows = await db
		.selectDistinct({ userId: userGroups.userId })
		.from(userGroups)
		.where(and(inArray(userGroups.groupId, scope.groupIds), inArray(userGroups.userId, userIds)))
	const members = new Set(rows.map((row) => row.userId))
	return (userId) => members.has(userId)
}

// GET /api/tests/:testId/assignments — list users assigned to this test
assignmentsRouter.get('/', validateUUID('testId'), sessionRequired(), async (req, res, next) => {
	try {
		const { testId } = req.params as { testId: string }
		if (!(await canReadTest(req, testId))) {
			res.status(403).json({ error: 'Forbidden' })
			return
		}
		const rows = await db
			.select({
				userId: testAssignments.userId,
				assignedAt: testAssignments.assignedAt,
				assignedBy: testAssignments.assignedBy,
				name: users.name,
				isActive: users.isActive,
				login: users.login,
			})
			.from(testAssignments)
			.innerJoin(users, eq(users.id, testAssignments.userId))
			.where(eq(testAssignments.testId, testId))
		const userIds = [...new Set(rows.map((row) => row.userId))]
		const requesterId = req.authUser!.id
		const [inScope, allowed, global] = await Promise.all([
			memberIdsInScope(req, userIds),
			canAssignMany(req, [testId], userIds),
			hasGlobalZone(req),
		])
		res.json({
			assignments: rows.map((row) => ({
				userId: row.userId,
				assignedAt: row.assignedAt,
				name: row.name,
				isActive: row.isActive,
				...(inScope(row.userId) ? { login: row.login } : {}),
				canUnassign: allowed(testId, row.userId) && (global || row.assignedBy === requesterId),
			})),
		})
	} catch (err) {
		next(err)
	}
})

// POST /api/tests/:testId/assignments — assign a user to this test
assignmentsRouter.post('/', validateUUID('testId'), sessionRequired(), async (req, res, next) => {
	try {
		const { testId } = req.params as { testId: string }
		const parsed = AssignUserSchema.safeParse(req.body)
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
			return
		}
		const { userId } = parsed.data
		if (!(await canAssign(req, testId, userId))) {
			res.status(403).json({ error: 'Forbidden' })
			return
		}
		const adminId = req.authUser!.id
		await addAssignments(testId, [userId], adminId)
		res.json({ ok: true })
	} catch (err) {
		next(err)
	}
})

// POST /api/tests/:testId/assignments/group/:groupId — bulk assignment для всей группы
assignmentsRouter.post(
	'/group/:groupId',
	validateUUID('testId'),
	validateUUID('groupId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const { testId, groupId } = req.params as { testId: string; groupId: string }
			if (!(await canWriteTest(req, testId)) || !(await canManageGroup(req, groupId))) {
				res.status(403).json({ error: 'Forbidden' })
				return
			}
			if (!(await hasPermission(req, 'tests.manage_assignments'))) {
				res.status(403).json({ error: 'Forbidden' })
				return
			}
			const adminId = req.authUser!.id

			const members = await db
				.select({ userId: userGroups.userId })
				.from(userGroups)
				.where(eq(userGroups.groupId, groupId))
			const memberIds = members.map(({ userId }) => userId)
			const allowed = await canAssignMany(req, [testId], memberIds)
			const assignees = memberIds.filter((userId) => allowed(testId, userId))

			if (assignees.length === 0) {
				res.json({ ok: true, assigned: 0 })
				return
			}

			const inserted = await addAssignments(testId, assignees, adminId)

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
	async (req, res, next) => {
		try {
			const { testId, userId } = req.params as { testId: string; userId: string }
			if (!(await removeAssignment(req, testId, userId))) {
				res.status(403).json({ error: 'Forbidden' })
				return
			}
			res.json({ ok: true })
		} catch (err) {
			next(err)
		}
	}
)
