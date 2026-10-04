import type { RoleKey } from '@bio-exam/rbac'
import { ROLE_KEYS } from '@bio-exam/rbac'

import { and, asc, count, desc, eq, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../db/index.js'
import {
	studentGroups,
	testAssignments,
	testAttempts,
	tests,
	topics,
	userGroups,
	users,
	userRoles,
} from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { AssignTestSchema } from '../../schemas/assignments.js'
import { PatchUserSchema } from '../../schemas/users.js'
import { canReadUser } from '../../services/access-policy/index.js'
import { revokeUserSessions } from '../../services/session/index.js'
import { avatarUrl } from '../../services/storage/links.js'
import type { UserRow } from '../../types/db/users.js'
import avatarRouter from './avatar.js'
import loginThrottleRouter from './login-throttle.js'
import profileRouter from './profile.js'
import sessionsRouter from './sessions.js'

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

		const [{ total }] = await db.select({ total: count() }).from(users)

		const createdByUser = alias(users, 'createdByUser')

		const rows = await db
			.select({
				id: users.id,
				login: users.login,
				firstName: users.firstName,
				lastName: users.lastName,
				name: users.name,
				avatar: users.avatar,
				avatarCropped: users.avatarCropped,
				avatarColor: users.avatarColor,
				initials: users.initials,
				isActive: users.isActive,
				invitedAt: users.invitedAt,
				activatedAt: users.activatedAt,
				createdAt: users.createdAt,
				createdByName: sql<string | null>`coalesce(${createdByUser.name}, ${createdByUser.login})`.as('createdByName'),
				roles: sql<string[]>`
          coalesce(array_agg(${userRoles.roleKey}) filter (where ${userRoles.roleKey} is not null), '{}')
        `.as('roles'),
				birthdate: users.birthdate,
				telegram: users.telegram,
				phone: users.phone,
				email: users.email,
				groupName: sql<string | null>`
          (select sg.name from user_groups ug
           inner join student_groups sg on sg.id = ug.group_id
           where ug.user_id = ${users.id}
           limit 1)
        `.as('groupName'),
			})
			.from(users)
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
			.leftJoin(createdByUser, eq(users.createdBy, createdByUser.id))
			.groupBy(
				users.id,
				users.login,
				users.firstName,
				users.lastName,
				users.name,
				users.avatar,
				users.avatarCropped,
				users.avatarColor,
				users.initials,
				users.isActive,
				users.invitedAt,
				users.activatedAt,
				users.createdAt,
				users.createdBy,
				users.birthdate,
				users.telegram,
				users.phone,
				users.email,
				createdByUser.name,
				createdByUser.login
			)
			.orderBy(desc(users.createdAt))
			.limit(limit)
			.offset(offset)

		const result: UserRow[] = rows.map((r) => ({
			id: r.id,
			login: r.login,
			firstName: r.firstName,
			lastName: r.lastName,
			name: r.name,
			avatar: avatarUrl(r.avatar),
			avatarCropped: avatarUrl(r.avatarCropped),
			avatarColor: r.avatarColor,
			initials: r.initials,
			isActive: Boolean(r.isActive),
			invitedAt: r.invitedAt ? new Date(r.invitedAt).toISOString() : null,
			activatedAt: r.activatedAt ? new Date(r.activatedAt).toISOString() : null,
			createdAt: new Date(r.createdAt).toISOString(),
			createdByName: r.createdByName,
			roles: r.roles ?? [],
			birthdate: r.birthdate,
			telegram: r.telegram,
			phone: r.phone,
			email: r.email,
			groupName: r.groupName ?? null,
		}))

		const readable = await Promise.all(result.map((row) => canReadUser(req, row.id)))
		const visible = result.filter((_, index) => readable[index])

		res.json({ rows: visible, users: visible, total })
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

			if (body.roles) {
				const allow = new Set<string>(ROLE_KEYS as ReadonlyArray<string>)
				const roleKeys = body.roles.filter((r: string): r is RoleKey => allow.has(r))

				await tx.delete(userRoles).where(eq(userRoles.userId, id))
				if (roleKeys.length > 0) {
					await tx.insert(userRoles).values(roleKeys.map((rk: RoleKey) => ({ userId: id, roleKey: rk })))
				}
			}
		})

		return res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

const patchGroupBodySchema = z.object({
	groupId: z.string().uuid().nullable(),
})

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
			const { groupId } = parsed.data

			const existing = await db.query.users.findFirst({ where: eq(users.id, id) })
			if (!existing) return res.status(404).json({ error: ERROR_MESSAGES.USER_NOT_FOUND })

			// Проверить существование группы если groupId указан
			if (groupId !== null) {
				const group = await db
					.select({ id: studentGroups.id })
					.from(studentGroups)
					.where(eq(studentGroups.id, groupId))
					.limit(1)
				if (group.length === 0) {
					return res.status(404).json({ error: 'Группа не найдена' })
				}
			}

			await db.transaction(async (tx) => {
				await tx.delete(userGroups).where(eq(userGroups.userId, id))
				if (groupId) {
					await tx.insert(userGroups).values({ groupId, userId: id }).onConflictDoNothing()
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
			const rows = await db
				.select({
					attemptId: testAttempts.id,
					testId: testAttempts.testId,
					testTitle: tests.title,
					testSlug: tests.slug,
					topicSlug: topics.slug,
					topicTitle: topics.title,
					submittedAt: testAttempts.submittedAt,
					earnedPoints: testAttempts.earnedPoints,
					totalPoints: testAttempts.totalPoints,
					scorePercentage: testAttempts.scorePercentage,
					passed: testAttempts.passed,
				})
				.from(testAttempts)
				.innerJoin(tests, eq(tests.id, testAttempts.testId))
				.innerJoin(topics, eq(topics.id, tests.topicId))
				.where(eq(testAttempts.userId, userId))
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
router.get(
	'/:userId/test-assignments',
	validateUUID('userId'),
	sessionRequired(),
	requirePerm('tests', 'manage_assignments'),
	async (req, res, next) => {
		try {
			const { userId } = req.params as { userId: string }
			const rows = await db
				.select({
					testId: testAssignments.testId,
					assignedAt: testAssignments.assignedAt,
					testTitle: tests.title,
					testSlug: tests.slug,
				})
				.from(testAssignments)
				.innerJoin(tests, eq(tests.id, testAssignments.testId))
				.where(eq(testAssignments.userId, userId))
			res.json({ assignments: rows })
		} catch (err) {
			next(err)
		}
	}
)

// POST /api/users/:userId/test-assignments — assign a test to a user
router.post(
	'/:userId/test-assignments',
	validateUUID('userId'),
	sessionRequired(),
	requirePerm('tests', 'manage_assignments'),
	async (req, res, next) => {
		try {
			const { userId } = req.params as { userId: string }
			const parsed = AssignTestSchema.safeParse(req.body)
			if (!parsed.success) {
				res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
				return
			}
			const { testId } = parsed.data
			const adminId = req.authUser!.id
			await db.insert(testAssignments).values({ testId, userId, assignedBy: adminId }).onConflictDoNothing()
			res.json({ ok: true })
		} catch (err) {
			next(err)
		}
	}
)

// DELETE /api/users/:userId/test-assignments/:testId — remove a test assignment from a user
router.delete(
	'/:userId/test-assignments/:testId',
	validateUUID('userId'),
	validateUUID('testId'),
	sessionRequired(),
	requirePerm('tests', 'manage_assignments'),
	async (req, res, next) => {
		try {
			const { userId, testId } = req.params as { userId: string; testId: string }
			await db
				.delete(testAssignments)
				.where(and(eq(testAssignments.testId, testId), eq(testAssignments.userId, userId)))
			res.json({ ok: true })
		} catch (err) {
			next(err)
		}
	}
)

export default router
