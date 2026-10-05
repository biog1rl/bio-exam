import type { RoleKey } from '@bio-exam/rbac'
import { ROLE_KEYS, STAFF_ROLE_KEYS } from '@bio-exam/rbac'

import { and, asc, count, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { testAssignments, testAttempts, tests, topics, userGroups, users, userRoles } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { AssignTestSchema } from '../../schemas/assignments.js'
import { PatchUserSchema } from '../../schemas/users.js'
import {
	canAssign,
	canAssignMany,
	canReadUser,
	groupOwners,
	hasGlobalZone,
	ineligibleTeacherGroupMembers,
	loadRoleTraits,
	releaseZone,
	testScope,
	userScope,
} from '../../services/access-policy/index.js'
import { attemptResultColumns } from '../../services/scored-attempt/index.js'
import { revokeUserSessions } from '../../services/session/index.js'
import { avatarUrl } from '../../services/storage/links.js'
import type { UserRow } from '../../types/db/users.js'
import { removeAssignment } from '../tests/assignments.js'
import avatarRouter from './avatar.js'
import loginThrottleRouter from './login-throttle.js'
import profileRouter from './profile.js'
import sessionsRouter from './sessions.js'
import { selectUserRows, serializeUserRow, userZoneFilter } from './user-rows.js'

const router = Router()

// Подключаем роуты профиля
router.use('/profile', profileRouter)
router.use('/avatar', avatarRouter)
router.use('/', sessionsRouter)
router.use('/', loginThrottleRouter)

const DIRECTORY_MIN_QUERY = 2
const DIRECTORY_DEFAULT_LIMIT = 10
const DIRECTORY_MAX_LIMIT = 20

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

router.get('/directory', sessionRequired(), async (req, res, next) => {
	try {
		const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
		if (q.length < DIRECTORY_MIN_QUERY) {
			return res.status(400).json({ error: 'Укажите не меньше 2 символов для поиска' })
		}
		const limit = Math.min(
			Math.max(Math.trunc(Number(req.query.limit)) || DIRECTORY_DEFAULT_LIMIT, 1),
			DIRECTORY_MAX_LIMIT
		)
		const escaped = escapeLikePattern(q)
		const contains = `%${escaped}%`
		const prefix = `${escaped}%`
		const fullName = sql`concat_ws(' ', ${users.firstName}, ${users.lastName})`

		const rows = await db
			.select({
				id: users.id,
				name: users.name,
				firstName: users.firstName,
				lastName: users.lastName,
				initials: users.initials,
				avatarColor: users.avatarColor,
				avatarCropped: users.avatarCropped,
			})
			.from(users)
			.where(
				and(
					eq(users.isActive, true),
					or(
						sql`${users.name} ilike ${contains} escape '\\'`,
						sql`${users.firstName} ilike ${contains} escape '\\'`,
						sql`${users.lastName} ilike ${contains} escape '\\'`,
						sql`${fullName} ilike ${contains} escape '\\'`
					)
				)
			)
			.orderBy(
				sql`case when lower(${users.name}) = lower(${q}) then 0 when ${users.name} ilike ${prefix} escape '\\' then 1 else 2 end`,
				asc(users.name),
				asc(users.id)
			)
			.limit(limit)

		return res.json({
			users: rows.map((row) => ({
				id: row.id,
				name: row.name,
				firstName: row.firstName,
				lastName: row.lastName,
				initials: row.initials,
				avatarColor: row.avatarColor,
				avatarCropped: avatarUrl(row.avatarCropped),
			})),
		})
	} catch (e) {
		next(e)
	}
})

// GET /api/users — JWT + RBAC ('users.read')
router.get('/', sessionRequired(), requirePerm('users', 'read'), async (req, res, next) => {
	try {
		const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
		const offset = Math.max(Number(req.query.offset) || 0, 0)

		const scope = await userScope(req)
		if (!scope.all && scope.groupIds.length === 0) {
			return res.json({ rows: [], users: [], total: 0 })
		}
		const zoneFilter = userZoneFilter(scope)

		const [{ total }] = await db.select({ total: count() }).from(users).where(zoneFilter)

		const rows = await selectUserRows({ scope, limit, offset })
		const result: UserRow[] = rows.map(serializeUserRow)

		res.json({ rows: result, users: result, total })
	} catch (e) {
		next(e)
	}
})

const USER_NOT_FOUND = 'Пользователь не найден'

router.get('/:id', validateUUID('id'), sessionRequired(), requirePerm('users', 'read'), async (req, res, next) => {
	try {
		const id = req.params.id as string
		if (!(await canReadUser(req, id))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		const scope = await userScope(req)
		const [row] = await selectUserRows({ where: eq(users.id, id), scope, limit: 1 })
		if (!row) return res.status(404).json({ error: USER_NOT_FOUND })
		return res.json({ user: serializeUserRow(row) })
	} catch (e) {
		next(e)
	}
})

router.get('/by-login/:login', sessionRequired(), requirePerm('users', 'read'), async (req, res, next) => {
	try {
		const login = String(req.params.login).trim()
		const scope = await userScope(req)
		let [row] = await selectUserRows({ where: eq(users.login, login), scope, limit: 1 })
		if (!row) {
			const folded = await selectUserRows({ where: sql`lower(${users.login}) = lower(${login})`, scope, limit: 2 })
			if (folded.length === 1) row = folded[0]
		}
		if (!row) {
			return (await hasGlobalZone(req))
				? res.status(404).json({ error: USER_NOT_FOUND })
				: res.status(403).json({ error: 'Forbidden' })
		}
		if (!(await canReadUser(req, row.id))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		return res.json({ user: serializeUserRow(row) })
	} catch (e) {
		next(e)
	}
})

router.patch('/:id', validateUUID('id'), sessionRequired(), requirePerm('users', 'edit'), async (req, res, next) => {
	try {
		const id = req.params.id as string
		const parsed = PatchUserSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}
		const body = parsed.data

		const existing = await db.query.users.findFirst({ where: eq(users.id, id) })
		if (!existing) return res.status(404).json({ error: ERROR_MESSAGES.USER_NOT_FOUND })

		const updates: Partial<typeof users.$inferInsert> = {}
		if (body.firstName !== undefined) updates.firstName = body.firstName
		if (body.lastName !== undefined) updates.lastName = body.lastName
		if (body.login !== undefined) updates.login = body.login
		if (body.isActive !== undefined) updates.isActive = body.isActive
		if (body.birthdate !== undefined) updates.birthdate = body.birthdate
		if (body.telegram !== undefined) updates.telegram = body.telegram
		if (body.phone !== undefined) updates.phone = body.phone
		if (body.email !== undefined) updates.email = body.email === '' ? null : body.email

		await db.transaction(async (tx) => {
			if (Object.keys(updates).length > 0) {
				await tx.update(users).set(updates).where(eq(users.id, id))
			}

			if (body.isActive === false) {
				await revokeUserSessions(id, { reason: 'deactivated' }, tx)
			}

			let zoneLost = false
			if (body.roles) {
				const allow = new Set<string>(ROLE_KEYS as ReadonlyArray<string>)
				const roleKeys = body.roles.filter((r: string): r is RoleKey => allow.has(r))
				const currentRoleKeys = await tx
					.select({ roleKey: userRoles.roleKey })
					.from(userRoles)
					.where(eq(userRoles.userId, id))

				await tx.delete(userRoles).where(eq(userRoles.userId, id))
				if (roleKeys.length > 0) {
					await tx.insert(userRoles).values(roleKeys.map((rk: RoleKey) => ({ userId: id, roleKey: rk })))
				}

				const before = new Set<string>(currentRoleKeys.map((row) => row.roleKey))
				const after = new Set<string>(roleKeys)
				const changed = before.size !== after.size || [...after].some((roleKey) => !before.has(roleKey))
				if (changed) {
					const traits = await loadRoleTraits(tx)
					zoneLost = ![...after].some((roleKey) => traits.get(roleKey)?.ownsZone === true)
				}
			}

			if (body.isActive === false || zoneLost) {
				await releaseZone(tx, id)
			}
		})

		return res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

const patchGroupBodySchema = z.union([
	z.object({ groupIds: z.array(z.string().uuid()).max(100) }),
	z.object({ groupId: z.string().uuid().nullable() }),
])

const NOT_STUDENT_MEMBER = 'В группу учителя можно добавить только учеников'
const DEACTIVATED_MEMBER = 'Деактивированного ученика нельзя добавить в группу'

// PATCH /api/users/:id/group — смена группы пользователя (null = убрать из группы)
router.patch(
	'/:id/group',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('users', 'edit'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string

			const parsed = patchGroupBodySchema.safeParse(req.body)
			if (!parsed.success) {
				return res.status(400).json({ error: 'Invalid groupId', details: parsed.error.flatten() })
			}
			const body = parsed.data
			const groupIds = [...new Set('groupIds' in body ? body.groupIds : body.groupId === null ? [] : [body.groupId])]

			const existing = await db.query.users.findFirst({ where: eq(users.id, id) })
			if (!existing) return res.status(404).json({ error: ERROR_MESSAGES.USER_NOT_FOUND })

			// Проверить существование группы если groupId указан
			const owners = await groupOwners(groupIds)
			if (owners.size !== groupIds.length) {
				return res.status(404).json({ error: 'Группа не найдена' })
			}

			const current = await db.select({ groupId: userGroups.groupId }).from(userGroups).where(eq(userGroups.userId, id))
			const currentIds = new Set(current.map((row) => row.groupId))
			const joinsTeacherGroup = groupIds.some((groupId) => owners.get(groupId) != null && !currentIds.has(groupId))
			if (joinsTeacherGroup) {
				const { notStudent, deactivated } = await ineligibleTeacherGroupMembers([id])
				if (notStudent.length > 0) return res.status(400).json({ error: NOT_STUDENT_MEMBER })
				if (deactivated.length > 0) return res.status(400).json({ error: DEACTIVATED_MEMBER })
			}

			await db.transaction(async (tx) => {
				await tx.delete(userGroups).where(eq(userGroups.userId, id))
				if (groupIds.length > 0) {
					await tx
						.insert(userGroups)
						.values(groupIds.map((groupId) => ({ groupId, userId: id })))
						.onConflictDoNothing()
				}
			})

			return res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

// DELETE /api/users/:id — удаление пользователя
router.delete('/:id', validateUUID('id'), sessionRequired(), requirePerm('users', 'edit'), async (req, res, next) => {
	try {
		const id = req.params.id as string

		const existing = await db.query.users.findFirst({ where: eq(users.id, id) })
		if (!existing) return res.status(404).json({ error: ERROR_MESSAGES.USER_NOT_FOUND })

		// Удаляем пользователя (каскадное удаление обработает связанные записи)
		await db.delete(users).where(eq(users.id, id))

		return res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// GET /api/users/:userId/test-attempts — list completed attempts for a user
router.get(
	'/:userId/test-attempts',
	validateUUID('userId'),
	sessionRequired(),
	requirePerm('tests', 'read'),
	async (req, res, next) => {
		try {
			const { userId } = req.params as { userId: string }
			const scope = await testScope(req)
			if (!scope.all) {
				if (scope.topicIds.length === 0) return res.json({ attempts: [] })
				const [staff] = await db
					.select({ userId: userRoles.userId })
					.from(userRoles)
					.where(and(eq(userRoles.userId, userId), inArray(userRoles.roleKey, [...STAFF_ROLE_KEYS])))
					.limit(1)
				if (staff) return res.json({ attempts: [] })
			}
			const rows = await db
				.select({
					attemptId: testAttempts.id,
					testId: testAttempts.testId,
					testTitle: tests.title,
					testSlug: tests.slug,
					topicSlug: topics.slug,
					topicTitle: topics.title,
					submittedAt: testAttempts.submittedAt,
					...attemptResultColumns,
				})
				.from(testAttempts)
				.innerJoin(tests, eq(tests.id, testAttempts.testId))
				.innerJoin(topics, eq(topics.id, tests.topicId))
				.where(and(eq(testAttempts.userId, userId), scope.all ? undefined : inArray(tests.topicId, scope.topicIds)))
				.orderBy(desc(testAttempts.submittedAt))

			res.json({
				attempts: rows.map((row) => ({
					...row,
					submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt,
				})),
			})
		} catch (err) {
			next(err)
		}
	}
)

// GET /api/users/:userId/test-assignments — list tests assigned to a user
router.get('/:userId/test-assignments', validateUUID('userId'), sessionRequired(), async (req, res, next) => {
	try {
		const { userId } = req.params as { userId: string }
		if (!(await canReadUser(req, userId))) {
			res.status(403).json({ error: 'Forbidden' })
			return
		}
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) {
			res.json({ assignments: [] })
			return
		}
		const rows = await db
			.select({
				testId: testAssignments.testId,
				assignedAt: testAssignments.assignedAt,
				assignedBy: testAssignments.assignedBy,
				testTitle: tests.title,
				testSlug: tests.slug,
			})
			.from(testAssignments)
			.innerJoin(tests, eq(tests.id, testAssignments.testId))
			.where(and(eq(testAssignments.userId, userId), scope.all ? undefined : inArray(tests.topicId, scope.topicIds)))
		const requesterId = req.authUser!.id
		const testIds = rows.map((row) => row.testId)
		const [allowed, global] = await Promise.all([canAssignMany(req, testIds, [userId]), hasGlobalZone(req)])
		res.json({
			assignments: rows.map((row) => ({
				testId: row.testId,
				assignedAt: row.assignedAt,
				testTitle: row.testTitle,
				testSlug: row.testSlug,
				canUnassign: allowed(row.testId, userId) && (global || row.assignedBy === requesterId),
			})),
		})
	} catch (err) {
		next(err)
	}
})

// POST /api/users/:userId/test-assignments — assign a test to a user
router.post('/:userId/test-assignments', validateUUID('userId'), sessionRequired(), async (req, res, next) => {
	try {
		const { userId } = req.params as { userId: string }
		const parsed = AssignTestSchema.safeParse(req.body)
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
			return
		}
		const { testId } = parsed.data
		if (!(await canAssign(req, testId, userId))) {
			res.status(403).json({ error: 'Forbidden' })
			return
		}
		const adminId = req.authUser!.id
		await db.insert(testAssignments).values({ testId, userId, assignedBy: adminId }).onConflictDoNothing()
		res.json({ ok: true })
	} catch (err) {
		next(err)
	}
})

// DELETE /api/users/:userId/test-assignments/:testId — remove a test assignment from a user
router.delete(
	'/:userId/test-assignments/:testId',
	validateUUID('userId'),
	validateUUID('testId'),
	sessionRequired(),
	async (req, res, next) => {
		try {
			const { userId, testId } = req.params as { userId: string; testId: string }
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

export default router
