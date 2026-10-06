import { eq, sql } from 'drizzle-orm'
import { Router } from 'express'

import { db } from '../db/index.js'
import { chartSettings } from '../db/schema.js'
import { ChartConfigsPatchSchema, resolveChartConfigs } from '../lib/charts/config.js'
import { ERROR_MESSAGES } from '../lib/constants.js'
import { requirePerm } from '../middleware/auth/requirePerm.js'
import { sessionRequired } from '../middleware/auth/session.js'

const router = Router()

const GLOBAL_ID = 'global'

async function readStoredConfigs() {
	const row = await db.query.chartSettings.findFirst({
		where: eq(chartSettings.id, GLOBAL_ID),
		columns: { configs: true, updatedAt: true },
	})
	return { configs: row?.configs ?? {}, updatedAt: row?.updatedAt ?? null }
}

function chartsReply(stored: { configs: unknown; updatedAt: Date | null }) {
	return {
		configs: resolveChartConfigs(stored.configs),
		updatedAt: stored.updatedAt ? stored.updatedAt.toISOString() : null,
	}
}

router.get('/charts', sessionRequired(), async (_req, res, next) => {
	try {
		res.json(chartsReply(await readStoredConfigs()))
	} catch (e) {
		next(e)
	}
})

router.put('/charts', sessionRequired(), requirePerm('settings', 'manage'), async (req, res, next) => {
	try {
		const parsed = ChartConfigsPatchSchema.safeParse(req.body)
		if (!parsed.success) {
			return res.status(400).json({ error: ERROR_MESSAGES.BAD_REQUEST, details: parsed.error.flatten() })
		}

		const patch = parsed.data.configs
		const now = new Date()
		const userId = req.authUser?.id ?? null

		const [saved] = await db
			.insert(chartSettings)
			.values({ id: GLOBAL_ID, configs: patch, updatedAt: now, updatedBy: userId })
			.onConflictDoUpdate({
				target: chartSettings.id,
				set: { configs: sql`${chartSettings.configs} || excluded.configs`, updatedAt: now, updatedBy: userId },
			})
			.returning({ configs: chartSettings.configs, updatedAt: chartSettings.updatedAt })

		res.json(chartsReply({ configs: saved?.configs ?? patch, updatedAt: saved?.updatedAt ?? now }))
	} catch (e) {
		next(e)
	}
})

export default router
