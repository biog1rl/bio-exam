import type { RoleKey } from '@bio-exam/rbac'

import { Router } from 'express'
import { z } from 'zod'

import { sessionRequired } from '../middleware/auth/session.js'
import { buildPermissionSetForUser } from '../services/rbac/rbac.js'
import { searchDatabase, type SearchScope } from '../services/search/database-search.js'

const router = Router()

const SearchQuerySchema = z.object({
	q: z.string().optional().default(''),
	scope: z.enum(['all', 'tests', 'questions', 'users', 'groups', 'attempts']).optional().default('all'),
	limit: z.coerce.number().int().min(1).max(25).optional().default(10),
})

router.get('/', sessionRequired(), async (req, res, next) => {
	try {
		const parsed = SearchQuerySchema.safeParse(req.query)
		if (!parsed.success) {
			return res.status(400).json({ error: 'Invalid search query', details: parsed.error.flatten() })
		}

		const user = req.authUser!
		const permissions = await buildPermissionSetForUser(user.id)
		const result = await searchDatabase({
			query: parsed.data.q,
			scope: parsed.data.scope as SearchScope,
			limit: parsed.data.limit,
			access: {
				userId: user.id,
				roles: user.roles as RoleKey[],
				permissions,
			},
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

export default router
