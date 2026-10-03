import { RequestHandler } from 'express'
import crypto from 'node:crypto'

// Middleware to ensure every request has an id and response header
export const requestId: RequestHandler = (req, res, next) => {
	// prefer incoming X-Request-Id header
	const incoming = req.headers['x-request-id']
	const id = typeof incoming === 'string' && incoming ? incoming : crypto.randomUUID()
	// @ts-ignore
	req.id = id
	res.setHeader('X-Request-Id', id)
	next()
}

export default requestId
