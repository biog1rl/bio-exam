import { asc, eq, inArray, sql } from 'drizzle-orm'
import { Router, type Request } from 'express'

import { db } from '../../db/index.js'
import { studentGroups, userGroups, users } from '../../db/schema.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { CreateGroupSchema, PatchGroupSchema } from '../../schemas/groups.js'
import {
	canManageGroup,
	canManageStudent,
	groupOwners,
	groupScope,
	hasGlobalZone,
	ineligibleTeacherGroupMembers,
	isZoneOwnerCandidate,
	nonStudentUserIds,
	setGroupOwner,
	studentOnlyFilter,
	zoneOwnerCandidates,
	type ZoneExecutor,
} from '../../services/access-policy/index.js'
import { peopleQuery, PEOPLE_QUERY_TOO_SHORT, searchPeople } from '../users/user-rows.js'

export const groupsRouter = Router()

const NOT_STUDENT_MEMBER = 'В группу учителя можно добавить только учеников'
const DEACTIVATED_MEMBER = 'Деактивированного ученика нельзя добавить в группу'
const PENDING_MEMBER = 'Ученика, который ещё не принял приглашение, добавляет в группу его учитель или администратор'
const STAFF_IN_TEACHER_GROUP = 'В группе учителя могут быть только ученики'
const OWNER_NOT_CANDIDATE = 'Учитель не найден или не активен'
const CANDIDATES_LIMIT = 20

type RuleViolation = { status: number; body: Record<string, unknown> }

async function teacherMemberViolation(
	req: Request,
	userIds: string[],
	executor: ZoneExecutor
): Promise<RuleViolation | null> {
	if (userIds.length === 0) return null
	const { notStudent, deactivated, pending } = await ineligibleTeacherGroupMembers(userIds, executor)
	if (notStudent.length > 0) return { status: 400, body: { error: NOT_STUDENT_MEMBER } }
	if (deactivated.length > 0) return { status: 400, body: { error: DEACTIVATED_MEMBER } }
	for (const userId of pending) {
		if (!(await canManageStudent(req, userId))) return { status: 400, body: { error: PENDING_MEMBER } }
	}
	return null
}

async function ownerViolation(
	ownerId: string | null,
	memberIds: string[],
	executor: ZoneExecutor
): Promise<RuleViolation | null> {
	if (ownerId === null) return null
	if (!(await isZoneOwnerCandidate(ownerId, executor))) return { status: 400, body: { error: OWNER_NOT_CANDIDATE } }
	const userIds = await nonStudentUserIds(memberIds, executor)
	if (userIds.length > 0) return { status: 400, body: { error: STAFF_IN_TEACHER_GROUP, userIds } }
	return null
}

async function deniedGroupReply(req: Request, groupId: string): Promise<RuleViolation> {
	if ((await groupScope(req)).all) {
		const [group] = await db
			.select({ id: studentGroups.id })
			.from(studentGroups)
			.where(eq(studentGroups.id, groupId))
			.limit(1)
		if (!group) return { status: 404, body: { error: 'Group not found' } }
	}
	return { status: 403, body: { error: 'Forbidden' } }
}

// GET /api/groups/my — студенческий эндпоинт (ДОЛЖЕН стоять ПЕРЕД /:groupId)
groupsRouter.get('/my', sessionRequired(), async (req, res, next) => {
	try {
		const userId = req.authUser!.id
		const groups = await db
			.select({ id: studentGroups.id, name: studentGroups.name })
			.from(userGroups)
			.innerJoin(studentGroups, eq(studentGroups.id, userGroups.groupId))
			.where(eq(userGroups.userId, userId))
			.orderBy(asc(studentGroups.name), asc(studentGroups.id))
		res.json({ groups, group: groups[0] ?? null })
	} catch (err) {
		next(err)
	}
})

groupsRouter.get('/candidates', sessionRequired(), requirePerm('groups', 'manage_groups'), async (req, res, next) => {
	try {
		const q = peopleQuery(req.query.q)
		if (q === null) {
			res.status(400).json({ error: PEOPLE_QUERY_TOO_SHORT })
			return
		}
		res.json({ users: await searchPeople(q, { limit: CANDIDATES_LIMIT, where: studentOnlyFilter(users.id) }) })
	} catch (err) {
		next(err)
	}
})

groupsRouter.get(
	'/owner-options',
	sessionRequired(),
	requirePerm('groups', 'manage_groups'),
	async (req, res, next) => {
		try {
			if (!(await hasGlobalZone(req))) {
				res.status(403).json({ error: 'Forbidden' })
				return
			}
			res.json({ owners: await zoneOwnerCandidates() })
		} catch (err) {
			next(err)
		}
	}
)

// GET /api/groups — список всех групп с количеством участников
groupsRouter.get('/', sessionRequired(), requirePerm('groups', 'manage_groups'), async (req, res, next) => {
	try {
		const scope = await groupScope(req)
		if (!scope.all && scope.groupIds.length === 0) {
			res.json({ groups: [] })
			return
		}
		const rows = await db
			.select({
				id: studentGroups.id,
				name: studentGroups.name,
				createdAt: studentGroups.createdAt,
				memberCount: sql<number>`count(${userGroups.userId})::int`.as('memberCount'),
			})
			.from(studentGroups)
			.leftJoin(userGroups, eq(userGroups.groupId, studentGroups.id))
			.where(scope.all ? undefined : inArray(studentGroups.id, scope.groupIds))
			.groupBy(studentGroups.id, studentGroups.name, studentGroups.createdAt)
			.orderBy(studentGroups.name)
		if (!(await hasGlobalZone(req))) {
			res.json({ groups: rows })
			return
		}
		const owners = await groupOwners(rows.map((row) => row.id))
		res.json({ groups: rows.map((row) => ({ ...row, owner: owners.get(row.id) ?? null })) })
	} catch (err) {
		next(err)
	}
})

// GET /api/groups/:groupId — детальная информация о группе с участниками
groupsRouter.get('/:groupId', validateUUID('groupId'), sessionRequired(), async (req, res, next) => {
	try {
		const { groupId } = req.params as { groupId: string }
		if (!(await canManageGroup(req, groupId))) {
			const denial = await deniedGroupReply(req, groupId)
			res.status(denial.status).json(denial.body)
			return
		}
		const groupRows = await db
			.select({ id: studentGroups.id, name: studentGroups.name, createdAt: studentGroups.createdAt })
			.from(studentGroups)
			.where(eq(studentGroups.id, groupId))
		if (groupRows.length === 0) {
			res.status(404).json({ error: 'Group not found' })
			return
		}
		const members = await db
			.select({ id: users.id, name: users.name, login: users.login, isActive: users.isActive })
			.from(userGroups)
			.innerJoin(users, eq(users.id, userGroups.userId))
			.where(eq(userGroups.groupId, groupId))
		res.json({ group: { ...groupRows[0], members } })
	} catch (err) {
		next(err)
	}
})

// POST /api/groups — создание группы
groupsRouter.post('/', sessionRequired(), requirePerm('groups', 'manage_groups'), async (req, res, next) => {
	try {
		const parsed = CreateGroupSchema.safeParse(req.body)
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
			return
		}
		const { name, memberIds } = parsed.data
		const requesterId = req.authUser!.id
		const global = await hasGlobalZone(req)
		if (!global && parsed.data.ownerId !== undefined) {
			res.status(403).json({ error: 'Forbidden' })
			return
		}
		const ownerId = global ? (parsed.data.ownerId ?? null) : requesterId
		const violation = global
			? await ownerViolation(ownerId, memberIds, db)
			: await teacherMemberViolation(req, memberIds, db)
		if (violation) {
			res.status(violation.status).json(violation.body)
			return
		}
		let createdGroup: typeof studentGroups.$inferSelect | undefined
		await db.transaction(async (tx) => {
			const [group] = await tx.insert(studentGroups).values({ name, createdBy: requesterId }).returning()
			await setGroupOwner(tx, { groupId: group.id, ownerId })
			createdGroup = { ...group, ownerId }
			if (memberIds.length > 0) {
				await tx
					.insert(userGroups)
					.values(memberIds.map((userId) => ({ groupId: group.id, userId })))
					.onConflictDoNothing()
			}
		})
		res.status(201).json({ group: createdGroup })
	} catch (err) {
		next(err)
	}
})

// PATCH /api/groups/:groupId — переименование и/или обновление состава
groupsRouter.patch('/:groupId', validateUUID('groupId'), sessionRequired(), async (req, res, next) => {
	try {
		const { groupId } = req.params as { groupId: string }
		if (!(await canManageGroup(req, groupId))) {
			const denial = await deniedGroupReply(req, groupId)
			res.status(denial.status).json(denial.body)
			return
		}
		const parsed = PatchGroupSchema.safeParse(req.body)
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
			return
		}
		const { name, memberIds, ownerId } = parsed.data
		const global = await hasGlobalZone(req)
		if (!global && ownerId !== undefined) {
			res.status(403).json({ error: 'Forbidden' })
			return
		}
		const violation = await db.transaction(async (tx) => {
			const current = await tx
				.select({ userId: userGroups.userId })
				.from(userGroups)
				.where(eq(userGroups.groupId, groupId))
			const currentIds = current.map((row) => row.userId)
			if (global && ownerId !== undefined) {
				const ownerProblem = await ownerViolation(ownerId, memberIds ?? currentIds, tx)
				if (ownerProblem) return ownerProblem
			} else if (global && memberIds !== undefined) {
				const owner = (await groupOwners([groupId], tx)).get(groupId) ?? null
				const userIds = owner === null ? [] : await nonStudentUserIds(memberIds, tx)
				if (userIds.length > 0) return { status: 400, body: { error: STAFF_IN_TEACHER_GROUP, userIds } }
			} else if (!global && memberIds !== undefined) {
				const known = new Set(currentIds)
				const memberProblem = await teacherMemberViolation(
					req,
					memberIds.filter((userId) => !known.has(userId)),
					tx
				)
				if (memberProblem) return memberProblem
			}
			if (name !== undefined) {
				await tx.update(studentGroups).set({ name, updatedAt: new Date() }).where(eq(studentGroups.id, groupId))
			}
			if (global && ownerId !== undefined) {
				await setGroupOwner(tx, { groupId, ownerId })
			}
			if (memberIds !== undefined) {
				await tx.delete(userGroups).where(eq(userGroups.groupId, groupId))
				if (memberIds.length > 0) {
					await tx.insert(userGroups).values([...new Set(memberIds)].map((userId) => ({ groupId, userId })))
				}
			}
			return null
		})
		if (violation) {
			res.status(violation.status).json(violation.body)
			return
		}
		res.json({ ok: true })
	} catch (err) {
		next(err)
	}
})

// DELETE /api/groups/:groupId — удаление группы (user_groups каскадно удаляются)
groupsRouter.delete('/:groupId', validateUUID('groupId'), sessionRequired(), async (req, res, next) => {
	try {
		const { groupId } = req.params as { groupId: string }
		if (!(await canManageGroup(req, groupId))) {
			const denial = await deniedGroupReply(req, groupId)
			res.status(denial.status).json(denial.body)
			return
		}
		await db.delete(studentGroups).where(eq(studentGroups.id, groupId))
		res.json({ ok: true })
	} catch (err) {
		next(err)
	}
})

export default groupsRouter
