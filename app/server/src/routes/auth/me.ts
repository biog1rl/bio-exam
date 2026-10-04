import { eq } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { requestAccess } from '../../services/access-policy/index.js'
import { avatarUrl } from '../../services/storage/links.js'

const router = Router()

router.get('/', async (req, res, next) => {
	try {
		res.setHeader('Cache-Control', 'no-store')

		const u = req.authUser
		if (!u?.id) return res.status(401).json({ ok: false })

		const row = await db.query.users.findFirst({ where: eq(users.id, u.id) })
		if (!row) return res.status(401).json({ ok: false })

		const access = await requestAccess(req)
		const roles = access.roles
		const perms = Array.from(access.permissions)

		return res.json({
			ok: true,
			user: {
				id: u.id,
				login: row.login ?? null,
				firstName: row.firstName ?? null,
				lastName: row.lastName ?? null,
				avatar: avatarUrl(row.avatar),
				avatarCropped: avatarUrl(row.avatarCropped),
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
			accessExpiresAt: u.accessExpiresAt?.toISOString() ?? null,
		})
	} catch (e) {
		next(e)
	}
})

export default router
