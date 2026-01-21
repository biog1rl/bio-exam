import { normaliseRoleKeys } from '@bio-exam/rbac'

import { eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { userRoles, users } from '../../db/schema.js'
import { sessionOptional } from '../../middleware/auth/session.js'
import { buildPermissionSetForUser } from '../../services/rbac/rbac.js'

const router = Router()

router.get('/', sessionOptional(), async (req, res) => {
	const u = req.authUser
	if (!u?.id) return res.status(200).json({ ok: false })

	const row = await db.query.users.findFirst({ where: eq(users.id, u.id) })
	if (!row) return res.status(200).json({ ok: false })

	const rs = await db.select({ role: userRoles.roleKey }).from(userRoles).where(eq(userRoles.userId, u.id))
	const roles = rs.map((r) => r.role)

	const perms = Array.from(await buildPermissionSetForUser(u.id))

	return res.json({
		ok: true,
		user: {
			id: u.id,
			login: row.login ?? null,
			firstName: row.firstName ?? null,
			lastName: row.lastName ?? null,
			avatar: row.avatar ?? null,
			avatarCropped: row.avatarCropped ?? null,
			avatarColor: row.avatarColor ?? null,
			initials: row.initials ?? null,
			avatarCropX: row.avatarCropX ?? null,
			avatarCropY: row.avatarCropY ?? null,
			avatarCropZoom: row.avatarCropZoom ?? null,
			avatarCropRotation: row.avatarCropRotation ?? null,
			avatarCropViewX: row.avatarCropViewX ?? null,
			avatarCropViewY: row.avatarCropViewY ?? null,
			roles,
			perms,
		},
	})
})

export default router
