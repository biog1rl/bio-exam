// app/server/src/middleware/auth/requirePerm.ts
import type { PermissionKey, PermissionDomain, ActionOf } from '@bio-exam/rbac'

import type { RequestHandler } from 'express'

import { buildPermissionSetForUser } from '../../services/rbac/rbac.js'

type AuthUserLike = { id: string; roles?: string[] } // достаточно id

export function requirePerm<D extends PermissionDomain>(domain: D, action: ActionOf<D>): RequestHandler {
	return (async (req, res, next) => {
		const u = (req as unknown as { authUser?: AuthUserLike | null }).authUser
		if (!u?.id) return res.status(401).json({ error: 'Unauthorized' })

		const perms = await buildPermissionSetForUser(u.id)
		const key = `${domain}.${action}` as PermissionKey
		if (!perms.has(key)) return res.status(403).json({ error: 'Forbidden' })

		next()
	}) as RequestHandler
}

export function requirePermKey(key: PermissionKey): RequestHandler {
	return (async (req, res, next) => {
		const u = (req as unknown as { authUser?: AuthUserLike | null }).authUser
		if (!u?.id) return res.status(401).json({ error: 'Unauthorized' })

		const perms = await buildPermissionSetForUser(u.id)
		if (!perms.has(key)) return res.status(403).json({ error: 'Forbidden' })

		next()
	}) as RequestHandler
}
