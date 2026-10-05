import { Router, type Response } from 'express'

import { sessionRequired } from '../../../middleware/auth/session.js'
import { validateUUID } from '../../../middleware/validateParams.js'
import { canReadTest, canWriteTest, canWriteTopic, testScope } from '../../../services/access-policy/index.js'
import { prepareTestArchive, prepareTopicArchive } from '../../../services/question-content/index.js'
import { sendArchive } from '../export-response.js'

const router = Router()

export const EXPORT_CONCURRENCY = 2
export const EXPORT_BUSY_MESSAGE = 'Экспорт уже выполняется, повторите позже'

let exportsInFlight = 0

function acquireExportSlot(res: Response): (() => void) | null {
	if (exportsInFlight >= EXPORT_CONCURRENCY) return null
	exportsInFlight += 1
	let released = false
	const release = () => {
		if (released) return
		released = true
		exportsInFlight -= 1
		res.off('close', release)
	}
	res.on('close', release)
	return release
}

function refuseBusy(res: Response) {
	return res.status(429).json({ error: EXPORT_BUSY_MESSAGE })
}

router.get('/:id/export', validateUUID('id'), sessionRequired(), async (req, res, next) => {
	let release: (() => void) | null = null
	try {
		const id = req.params.id as string
		if (!(await canReadTest(req, id))) return res.status(403).json({ error: 'Forbidden' })

		release = acquireExportSlot(res)
		if (!release) return refuseBusy(res)
		const withAnswers = req.query.withAnswers === 'true' && (await canWriteTest(req, id))
		const prepared = await prepareTestArchive({ testId: id, withAnswers })
		return await sendArchive(req, res, prepared)
	} catch (e) {
		return next(e)
	} finally {
		release?.()
	}
})

router.get('/topics/:slug/export', sessionRequired(), async (req, res, next) => {
	let release: (() => void) | null = null
	try {
		const scope = await testScope(req)
		if (!scope.all && scope.topicIds.length === 0) return res.status(403).json({ error: 'Forbidden' })

		release = acquireExportSlot(res)
		if (!release) return refuseBusy(res)
		const withAnswers = req.query.withAnswers === 'true'
		const prepared = await prepareTopicArchive({
			topicSlug: req.params.slug as string,
			withAnswers,
			scope,
			answersAllowed: (topicId) => canWriteTopic(req, topicId),
		})
		return await sendArchive(req, res, prepared)
	} catch (e) {
		return next(e)
	} finally {
		release?.()
	}
})

export { router as exportRouter }
