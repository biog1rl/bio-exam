/**
 * Settings router — key-value app settings for admin use.
 * Mounted at /api/settings
 */
import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'

import { db } from '../db/index.js'
import { appSettings } from '../db/schema.js'
import { sessionRequired } from '../middleware/auth/session.js'

const router = Router()

const CHART_RANGE_KEY = 'chart_default_range'

const ChartRangeValueSchema = z.enum(['week', 'month', 'all'])

// GET /api/settings/chart-default-range
router.get('/chart-default-range', sessionRequired(), async (req, res, next) => {
	try {
		const userId = req.authUser?.id
		if (!userId) return res.status(401).json({ error: 'Unauthorized' })

		const isAdmin = req.authUser?.roles?.includes('admin') ?? false
		if (!isAdmin) return res.status(403).json({ error: 'Forbidden' })

		let row: { value: string } | undefined
		try {
			row = await db.query.appSettings.findFirst({
				where: eq(appSettings.key, CHART_RANGE_KEY),
				columns: { value: true },
			})
		} catch (error) {
			req.log?.error?.({ err: error }, 'Failed to read chart default range, using fallback')
			return res.json({ value: 'month' })
		}

		res.json({ value: row?.value ?? 'month' })
	} catch (e) {
		next(e)
	}
})

// PUT /api/settings/chart-default-range
router.put('/chart-default-range', sessionRequired(), async (req, res, next) => {
	try {
		const userId = req.authUser?.id
		if (!userId) return res.status(401).json({ error: 'Unauthorized' })

		const isAdmin = req.authUser?.roles?.includes('admin') ?? false
		if (!isAdmin) return res.status(403).json({ error: 'Forbidden' })

		const parsed = z.object({ value: ChartRangeValueSchema }).safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() })
		}

		await db
			.insert(appSettings)
			.values({ key: CHART_RANGE_KEY, value: parsed.data.value })
			.onConflictDoUpdate({
				target: appSettings.key,
				set: { value: parsed.data.value },
			})

		res.json({ value: parsed.data.value })
	} catch (e) {
		next(e)
	}
})

export default router
