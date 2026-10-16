import { UPLOAD_LINK_INVALID_MESSAGE } from '@bio-exam/exam-core'

import type { NextFunction, Request, Response } from 'express'

import { logger } from '../lib/logger.js'
import { nameMiddleware } from '../lib/middleware-name.js'
import { resolveUploadLink, touchUploadLink, uploadLinkSlot, type UploadScope } from '../services/upload-links/index.js'
import { rateLimiter } from './rateLimiter.js'

declare module 'express-serve-static-core' {
	interface Request {
		uploadScope?: UploadScope
	}
}

const MINUTE_MS = 60_000

const RATE_LIMIT_HEADERS = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']

const resolvedLinkIds = new WeakMap<Request, string>()

const ipGuard = rateLimiter({ keyPrefix: 'upload-ip', maxAttempts: 3000, windowMs: MINUTE_MS })

const unknownTokenLimiter = rateLimiter({ keyPrefix: 'upload-unknown', maxAttempts: 600, windowMs: MINUTE_MS })

const linkLimiter = rateLimiter({
	keyPrefix: 'upload-link',
	maxAttempts: 120,
	windowMs: MINUTE_MS,
	clientKey: (req) => resolvedLinkIds.get(req),
})

function count(limiter: ReturnType<typeof rateLimiter>, req: Request, res: Response): void {
	limiter(req, res, () => undefined)
}

export function sendInvalidUploadLink(res: Response) {
	for (const header of RATE_LIMIT_HEADERS) res.removeHeader(header)
	return res.status(404).json({ error: UPLOAD_LINK_INVALID_MESSAGE })
}

export const uploadTokenRequired = nameMiddleware(async (req: Request, res: Response, next: NextFunction) => {
	try {
		count(ipGuard, req, res)
		const link = await resolveUploadLink(req.headers['x-upload-token'])
		if (!link) {
			count(unknownTokenLimiter, req, res)
			return sendInvalidUploadLink(res)
		}
		resolvedLinkIds.set(req, link.linkId)
		count(linkLimiter, req, res)
		const state = await uploadLinkSlot(link)
		if (state.kind === 'invalid') return sendInvalidUploadLink(res)
		if (state.kind === 'window') return res.status(state.status).json(state.body)
		req.uploadScope = state.scope
		const log = req.log ?? logger
		res.on('finish', () => {
			if (res.statusCode < 400) void touchUploadLink(state.scope.linkId, log)
		})
		return next()
	} catch (error) {
		return next(error)
	}
}, 'uploadTokenRequired')
