import type { Request } from 'express'

export function clientIp(req: Request): string {
	return req.ip || req.socket.remoteAddress || 'unknown'
}
