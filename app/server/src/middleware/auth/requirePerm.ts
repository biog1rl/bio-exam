import type { PermissionKey, PermissionDomain, ActionOf } from '@bio-exam/rbac'

import type { RequestHandler } from 'express'

import { requestAccess } from '../../services/access-policy/index.js'

type AuthUserLike = { id: string }

function permissionGuard(key: PermissionKey): RequestHandler {
	return (async (req, res, next) => {
		const u = (req as unknown as { authUser?: AuthUserLike | null }).authUser
		if (!u?.id) return res.status(401).json({ error: 'Unauthorized' })

		try {
			const access = await requestAccess(req)
			if (!access.permissions.has(key)) return res.status(403).json({ error: 'Forbidden' })
		} catch (error) {
			return next(error)
		}

		next()
	}) as RequestHandler
}

export function requirePerm<D extends PermissionDomain>(domain: D, action: ActionOf<D>): RequestHandler {
	return permissionGuard(`${domain}.${action}` as PermissionKey)
}

export function requirePermKey(key: PermissionKey): RequestHandler {
	return permissionGuard(key)
}
