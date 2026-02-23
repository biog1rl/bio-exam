import type { RoleKey } from '@bio-exam/rbac'
import { ROLE_KEYS } from '@bio-exam/rbac'

import { and, desc, eq, sql } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { testAssignments, testAttempts, tests, topics, users, userRoles } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import { AssignTestSchema } from '../../schemas/assignments.js'
import { PatchUserSchema } from '../../schemas/users.js'
import { invalidateRBACCache } from '../../services/rbac/rbac.js'
import type { UserRow } from '../../types/db/users.js'
import avatarRouter from './avatar.js'
import profileRouter from './profile.js'

const router = Router()

// Подключаем роуты профиля
router.use('/profile', profileRouter)
router.use('/avatar', avatarRouter)

// GET /api/users — JWT + RBAC ('users.read')
router.get('/', sessionRequired(), requirePerm('users', 'read'), async (_req, res, next) => {
	try {
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
				createdByName: sql<string | null>`
          coalesce(
            (select coalesce(cb.name, cb.login) from users cb where cb.id = ${users.createdBy}),
            (select coalesce(ub.name, ub.login)
               from invites i
               left join users ub on ub.id = i.created_by
              where i.user_id = ${users.id}
              order by i.created_at desc
              limit 1)
          )
        `.as('createdByName'),
				roles: sql<string[]>`
          coalesce(array_agg(${userRoles.roleKey}) filter (where ${userRoles.roleKey} is not null), '{}')
        `.as('roles'),
				birthdate: users.birthdate,
				telegram: users.telegram,
				phone: users.phone,
				email: users.email,
			})
			.from(users)
			.leftJoin(userRoles, eq(userRoles.userId, users.id))
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
				users.email
			)
			.orderBy(desc(users.createdAt))

		const result: UserRow[] = rows.map((r) => ({
			id: r.id,
			login: r.login,
			firstName: r.firstName,
			lastName: r.lastName,
			name: r.name,
			avatar: r.avatar,
			avatarCropped: r.avatarCropped,
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
		}))

		res.json({ users: result })
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

		let rolesChanged = false

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

			if (body.roles) {
				const allow = new Set<string>(ROLE_KEYS as ReadonlyArray<string>)
				const roleKeys = body.roles.filter((r: string): r is RoleKey => allow.has(r))

				await tx.delete(userRoles).where(eq(userRoles.userId, id))
				if (roleKeys.length > 0) {
					await tx.insert(userRoles).values(roleKeys.map((rk: RoleKey) => ({ userId: id, roleKey: rk })))
				}
				rolesChanged = true
			}
		})

		// ВАЖНО: если роли менялись — инвалидируем кэш прав
		if (rolesChanged) invalidateRBACCache()

		return res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// DELETE /api/users/:id — удаление пользователя
router.delete('/:id', validateUUID('id'), sessionRequired(), requirePerm('users', 'edit'), async (req, res, next) => {
	try {
		const id = req.params.id as string

		const existing = await db.query.users.findFirst({ where: eq(users.id, id) })
		if (!existing) return res.status(404).json({ error: ERROR_MESSAGES.USER_NOT_FOUND })

		// Удаляем пользователя (каскадное удаление обработает связанные записи)
		await db.delete(users).where(eq(users.id, id))

		// Инвалидируем кэш RBAC, так как пользователь удален
		invalidateRBACCache()

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
