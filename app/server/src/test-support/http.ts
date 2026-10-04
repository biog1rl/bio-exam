import type { RoleKey } from '@bio-exam/rbac'

import type { Express } from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'

import { AUTH_CONFIG } from '../config/auth.js'

export function sessionCookieFor(user: { id: string; roles: RoleKey[]; login?: string | null }): string {
	const token = jwt.sign({ sub: user.id, roles: user.roles, login: user.login ?? null }, AUTH_CONFIG.jwtSecret, {
		expiresIn: '10m',
	})
	return `${AUTH_CONFIG.sessionCookieName}=${encodeURIComponent(token)}`
}

export function startTestServer(app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
	return new Promise((resolve, reject) => {
		const server = app.listen(0, '127.0.0.1')
		server.once('error', reject)
		server.once('listening', () => {
			const { port } = server.address() as AddressInfo
			resolve({
				baseUrl: `http://127.0.0.1:${port}`,
				close: () =>
					new Promise<void>((done, fail) => {
						server.close((error) => (error ? fail(error) : done()))
						server.closeAllConnections()
					}),
			})
		})
	})
}
