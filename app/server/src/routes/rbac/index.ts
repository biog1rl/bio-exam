import { ROLE_REGISTRY, type RoleKey } from '@bio-exam/rbac'

import { and, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../../db/index.js'
import { rbacPageRules, rbacRoleGrants, rbacUserGrants, userRoles } from '../../db/schema.js'
import { requirePerm } from '../../middleware/auth/requirePerm.js'
import { sessionRequired } from '../../middleware/auth/session.js'
import { invalidateRBACCache, buildPermissionSet, isValidAction } from '../../services/rbac/rbac.js'

const router = Router()

// ---------- Roles & role-grants

router.get('/roles', sessionRequired(), requirePerm('rbac', 'read'), async (_req, res, next) => {
	try {
		const roles = Object.values(ROLE_REGISTRY).map((r) => ({
			key: r.key,
			name: r.name,
			order: r.order ?? 999,
			grants: r.grants,
		}))
		const overrides = await db.select().from(rbacRoleGrants)
		res.json({ roles, overrides })
	} catch (e) {
		next(e)
	}
})

const GrantBody = z.object({
	roleKey: z.string(),
	domain: z.string(),
	action: z.string(),
	allow: z.boolean(),
})

router.post('/grant', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = GrantBody.safeParse(req.body)
		if (!parsed.success) return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		const { roleKey, domain, action, allow } = parsed.data

		if (roleKey === 'admin') return res.status(400).json({ error: 'Admin role grants are immutable' })
		if (!ROLE_REGISTRY[roleKey as RoleKey]) return res.status(404).json({ error: 'Unknown role' })
		if (!isValidAction(domain, action)) return res.status(400).json({ error: 'Unknown domain/action' })

		await db
			.insert(rbacRoleGrants)
			.values({ roleKey, domain, action, allow })
			.onConflictDoUpdate({
				target: [rbacRoleGrants.roleKey, rbacRoleGrants.domain, rbacRoleGrants.action],
				set: { allow },
			})

		invalidateRBACCache()
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

router.delete('/grant', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = GrantBody.omit({ allow: true }).safeParse(req.body)
		if (!parsed.success) return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		const { roleKey, domain, action } = parsed.data

		if (roleKey === 'admin') return res.status(400).json({ error: 'Admin role grants are immutable' })

		await db
			.delete(rbacRoleGrants)
			.where(
				and(eq(rbacRoleGrants.roleKey, roleKey), eq(rbacRoleGrants.domain, domain), eq(rbacRoleGrants.action, action))
			)

		invalidateRBACCache()
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// ---------- User grants (user overrides have priority over role)

router.get('/user/:id/grants', sessionRequired(), requirePerm('rbac', 'read'), async (req, res, next) => {
	try {
		const userId = req.params.id

		// роли пользователя
		const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, userId))
		const roles = rs.map((r) => r.role as RoleKey)

		// права по ролям (с учётом role-overrides allow/deny)
		const rolePerms = await buildPermissionSet(roles)
		const roleKeys = Array.from(rolePerms.values())

		// пользовательские overrides (allow/deny)
		const userRows = await db.select().from(rbacUserGrants).where(eq(rbacUserGrants.userId, userId))
		const userOverrides = userRows.map((r) => ({
			domain: r.domain,
			action: r.action,
			allow: Boolean(r.allow),
		}))

		// Эффективность: старт с rolePerms, затем применить userOverrides (allow=add, deny=delete)
		const eff = new Set<string>(roleKeys)
		for (const o of userOverrides) {
			const k = `${o.domain}.${o.action}`
			if (o.allow) eff.add(k)
			else eff.delete(k)
		}

		res.json({
			roles,
			roleKeys,
			userOverrides, // [{domain, action, allow}]
			effective: Array.from(eff),
		})
	} catch (e) {
		next(e)
	}
})

const UserGrantBody = z.object({
	userId: z.string().uuid(),
	domain: z.string(),
	action: z.string(),
	allow: z.boolean(),
})

// upsert персонального override (allow=true|false)
router.post('/user/grant', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = UserGrantBody.safeParse(req.body)
		if (!parsed.success) return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		const { userId, domain, action, allow } = parsed.data

		if (!isValidAction(domain, action)) return res.status(400).json({ error: 'Unknown domain/action' })

		// если пользователь — admin, не даём трогать
		const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, userId))
		if (rs.some((r) => r.role === 'admin')) return res.status(400).json({ error: 'Admin user grants are immutable' })

		await db
			.insert(rbacUserGrants)
			.values({ userId, domain, action, allow })
			.onConflictDoUpdate({
				target: [rbacUserGrants.userId, rbacUserGrants.domain, rbacUserGrants.action],
				set: { allow },
			})

		invalidateRBACCache()
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// удалить персональный override (вернуться к поведению роли)
router.delete('/user/grant', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const parsed = UserGrantBody.omit({ allow: true }).safeParse(req.body)
		if (!parsed.success) return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		const { userId, domain, action } = parsed.data

		await db
			.delete(rbacUserGrants)
			.where(
				and(eq(rbacUserGrants.userId, userId), eq(rbacUserGrants.domain, domain), eq(rbacUserGrants.action, action))
			)

		invalidateRBACCache()
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

// ---------- Optional: page rules

const RuleBody = z.object({
	id: z.string().uuid().optional(),
	pattern: z.string().min(1),
	domain: z.string(),
	action: z.string(),
	exact: z.boolean().optional().default(false),
	enabled: z.boolean().optional().default(true),
})

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
		const parsed = RuleBody.safeParse(req.body)
		if (!parsed.success) return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		const { pattern, domain, action, exact, enabled } = parsed.data
		await db.insert(rbacPageRules).values({ pattern, domain, action, exact, enabled })
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

router.patch('/pages/:id', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const id = req.params.id
		const parsed = RuleBody.partial({ pattern: true, domain: true, action: true }).safeParse(req.body)
		if (!parsed.success) return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		await db.update(rbacPageRules).set(parsed.data).where(eq(rbacPageRules.id, id))
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

router.delete('/pages/:id', sessionRequired(), requirePerm('rbac', 'write'), async (req, res, next) => {
	try {
		const id = req.params.id
		await db.delete(rbacPageRules).where(eq(rbacPageRules.id, id))
		res.json({ ok: true })
	} catch (e) {
		next(e)
	}
})

export default router
