import type { NextFunction, Request, Response } from 'express'

export function inFlightGate(options: { limit: number; retryAfterSeconds: number; message: string }) {
	let inFlight = 0
	return function photoBodyGate(_req: Request, res: Response, next: NextFunction) {
		if (inFlight >= options.limit) {
			res.setHeader('Retry-After', String(options.retryAfterSeconds))
			return res.status(503).json({ error: options.message })
		}
		inFlight += 1
		let released = false
		const release = () => {
			if (released) return
			released = true
			inFlight -= 1
		}
		res.once('close', release)
		return next()
	}
}
