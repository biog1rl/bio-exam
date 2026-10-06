import { ROLE_REGISTRY, type RoleKey } from '@bio-exam/rbac'

import { and, eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { rbacPageRules, rbacRoleGrants, rbacUserGrants, userRoles } from '../../db/schema.js'
import { ERROR_MESSAGES } from '../../lib/constants.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { validateUUID } from '../../middleware/validateParams.js'
import {
	GrantSchema,
	DeleteGrantSchema,
	UserGrantSchema,
	DeleteUserGrantSchema,
	PageRuleSchema,
	PatchPageRuleSchema,
} from '../../schemas/rbac.js'
import { accessPolicy, isValidAction, loadRoleTraits } from '../../services/access-policy/index.js'

const router = Router()

// ---------- Roles & role-grants

router.get('/roles', sessionRequired(), requirePerm('rbac', 'read'), async (_req, res, next) => {
	try {
		const traits = await loadRoleTraits()
		const roles = Object.values(ROLE_REGISTRY).map((r) => ({
			key: r.key,
			name: r.name,
			order: r.order ?? 999,
			grants: r.grants,
			ownsZone: traits.get(r.key)?.ownsZone ?? false,
			groupMember: traits.get(r.key)?.groupMember ?? false,
		}))
		const overrides = await db.select().from(rbacRoleGrants)
		res.json({ roles, overrides })
	} catch (e) {
		next(e)
	}
})

router.post('/grant', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = GrantSchema.safeParse(req.body)
		if (!parsed.success)
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		const { roleKey, domain, action, allow } = parsed.data

		if (roleKey === 'admin') return res.status(400).json({ error: ERROR_MESSAGES.ADMIN_GRANTS_IMMUTABLE })
		if (!ROLE_REGISTRY[roleKey as RoleKey]) return res.status(404).json({ error: ERROR_MESSAGES.UNKNOWN_ROLE })
		if (!isValidAction(domain, action)) return res.status(400).json({ error: ERROR_MESSAGES.UNKNOWN_DOMAIN_ACTION })

		await db
			.insert(rbacRoleGrants)
			.values({ roleKey, domain, action, allow })
			.onConflictDoUpdate({
				target: [rbacRoleGrants.roleKey, rbacRoleGrants.domain, rbacRoleGrants.action],
				set: { allow },
			})

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

router.delete('/grant', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = DeleteGrantSchema.safeParse(req.body)
		if (!parsed.success)
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		const { roleKey, domain, action } = parsed.data

		if (roleKey === 'admin') return res.status(400).json({ error: ERROR_MESSAGES.ADMIN_GRANTS_IMMUTABLE })

		await db
			.delete(rbacRoleGrants)
			.where(
				and(eq(rbacRoleGrants.roleKey, roleKey), eq(rbacRoleGrants.domain, domain), eq(rbacRoleGrants.action, action))
			)

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

async function hasAdminRole(userId: string): Promise<boolean> {
	const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, userId))
	return rs.some((r) => r.role === 'admin')
}

// ---------- User grants (user overrides have priority over role)

router.get(
	'/user/:id/grants',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('rbac', 'read'),
	async (req, res, next) => {
		try {
			const userId = req.params.id as string
			const access = await accessPolicy.accessFor(userId)

			res.json({
				roles: access.snapshot.roles,
				roleKeys: Array.from(access.rolePermissions),
				userOverrides: access.snapshot.userGrants.map((row) => ({
					domain: row.domain,
					action: row.action,
					allow: row.allow,
				})),
				effective: Array.from(access.permissions),
			})
		} catch (e) {
			next(e)
		}
	}
)

// upsert персонального override (allow=true|false)
router.post('/user/grant', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = UserGrantSchema.safeParse(req.body)
		if (!parsed.success)
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		const { userId, domain, action, allow } = parsed.data

		if (!isValidAction(domain, action)) return res.status(400).json({ error: ERROR_MESSAGES.UNKNOWN_DOMAIN_ACTION })

		if (await hasAdminRole(userId)) return res.status(400).json({ error: ERROR_MESSAGES.ADMIN_USER_GRANTS_IMMUTABLE })

		await db
			.insert(rbacUserGrants)
			.values({ userId, domain, action, allow })
			.onConflictDoUpdate({
				target: [rbacUserGrants.userId, rbacUserGrants.domain, rbacUserGrants.action],
				set: { allow },
			})

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// удалить персональный override (вернуться к поведению роли)
router.delete('/user/grant', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = DeleteUserGrantSchema.safeParse(req.body)
		if (!parsed.success)
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		const { userId, domain, action } = parsed.data

		if (await hasAdminRole(userId)) return res.status(400).json({ error: ERROR_MESSAGES.ADMIN_USER_GRANTS_IMMUTABLE })

		await db
			.delete(rbacUserGrants)
			.where(
				and(eq(rbacUserGrants.userId, userId), eq(rbacUserGrants.domain, domain), eq(rbacUserGrants.action, action))
			)

		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// ---------- Optional: page rules

router.get('/pages', sessionRequired(), requirePerm('rbac', 'read'), async (_req, res, next) => {
	try {
		const rules = await db.select().from(rbacPageRules)
		res.json({ rules })
	} catch (e) {
		next(e)
	}
})

router.post('/pages', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = PageRuleSchema.safeParse(req.body)
		if (!parsed.success)
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		const { pattern, domain, action, exact, enabled } = parsed.data
		await db.insert(rbacPageRules).values({ pattern, domain, action, exact, enabled })
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

router.patch(
	'/pages/:id',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('rbac', 'write'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string
			const parsed = PatchPageRuleSchema.safeParse(req.body)
			if (!parsed.success)
				return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
			await db.update(rbacPageRules).set(parsed.data).where(eq(rbacPageRules.id, id))
			res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

router.delete(
	'/pages/:id',
	validateUUID('id'),
	sessionRequired(),
	requirePerm('rbac', 'write'),
	async (req, res, next) => {
		try {
			const id = req.params.id as string
			await db.delete(rbacPageRules).where(eq(rbacPageRules.id, id))
			res.json({ ok: true })
		} catch (e) {
			next(e)
		}
	}
)

export default router
