import { Router } from 'express'
import { z } from 'zod'

import { sessionRequired } from '../middleware/auth/session.js'
import { canReadTest } from '../services/access-policy/index.js'
import {
	countUnread,
	decodeCursor,
	listNotifications,
	markAllRead,
	markRead,
	openNotification,
} from '../services/notifications/index.js'

const router = Router()

const NotificationsQuerySchema = z.object({
	cursor: z.string().min(1).max(512).optional(),
	limit: z.coerce.number().int().min(1).max(50).default(20),
})

router.get('/', sessionRequired(), async (req, res, next) => {
	try {
		const parsed = NotificationsQuerySchema.safeParse(req.query)
		if (!parsed.success) {
			return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
		}
		const cursor = parsed.data.cursor === undefined ? null : decodeCursor(parsed.data.cursor)
		if (parsed.data.cursor !== undefined && cursor === null) {
			return res.status(400).json({ error: 'Invalid request' })
		}
		res.json(await listNotifications(req.authUser!.id, { cursor, limit: parsed.data.limit }))
	} catch (err) {
		next(err)
	}
})

router.get('/unread-count', sessionRequired(), async (req, res, next) => {
	try {
		res.json({ count: await countUnread(req.authUser!.id) })
	} catch (err) {
		next(err)
	}
})

router.post('/read-all', sessionRequired(), async (req, res, next) => {
	try {
		await markAllRead(req.authUser!.id)
		res.json({ ok: true })
	} catch (err) {
		next(err)
	}
})

router.post('/:id/read', sessionRequired(), async (req, res, next) => {
	try {
		const found = await markRead(req.authUser!.id, String(req.params.id))
		if (!found) return res.status(404).json({ error: 'Not found' })
		res.json({ ok: true })
	} catch (err) {
		next(err)
	}
})

router.get('/:id/open', sessionRequired(), async (req, res, next) => {
	try {
		const result = await openNotification(req.authUser!.id, String(req.params.id), {
			canReadTest: (testId) => canReadTest(req, testId),
		})
		if (!result.ok) return res.status(403).json({ error: 'NO_ACCESS' })
		res.json({ href: result.href })
	} catch (err) {
		next(err)
	}
})

export default router
