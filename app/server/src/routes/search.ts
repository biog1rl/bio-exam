import { Router } from 'express'
import { z } from 'zod'

import { sessionRequired } from '../middleware/auth/session.js'
import { rateLimiter } from '../middleware/rateLimiter.js'
import { groupScope, requestAccess, testScope, userScope } from '../services/access-policy/index.js'
import { searchDatabase, type SearchScope } from '../services/search/database-search.js'

const router = Router()

const searchRateLimiter = rateLimiter({
	maxAttempts: 60,
	windowMs: 60 * 1000,
	keyPrefix: 'search',
	clientKey: (req) => (req.authUser?.id ? `user:${req.authUser.id}` : undefined),
})

const SearchQuerySchema = z.object({
	q: z.string().optional().default(''),
	scope: z.enum(['all', 'tests', 'questions', 'users', 'groups', 'attempts']).optional().default('all'),
	limit: z.coerce.number().int().min(1).max(25).optional().default(10),
})

router.get('/', sessionRequired(), searchRateLimiter, async (req, res, next) => {
	try {
		const parsed = SearchQuerySchema.safeParse(req.query)
		if (!parsed.success) {
			return res.status(400).json({ error: 'Invalid search query', details: parsed.error.flatten() })
		}

		const user = req.authUser!
		const [access, tests, groups, users] = await Promise.all([
			requestAccess(req),
			testScope(req),
			groupScope(req),
			userScope(req),
		])
		const result = await searchDatabase({
			query: parsed.data.q,
			scope: parsed.data.scope as SearchScope,
			limit: parsed.data.limit,
			access: {
				userId: user.id,
				permissions: access.permissions,
				tests,
				groups,
				users,
			},
		})

		res.json(result)
	} catch (error) {
		next(error)
	}
})

export default router
