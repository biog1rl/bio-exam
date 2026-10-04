import type { Express } from 'express'
import type { AddressInfo } from 'node:net'

export async function sessionCookieFor(user: { id: string; login?: string | null }): Promise<string> {
	const { ACCESS_COOKIE, openSession } = await import('../services/session/index.js')
	const session = await openSession({ userId: user.id, login: user.login ?? null, ip: null })
	return `${ACCESS_COOKIE}=${encodeURIComponent(session.accessToken)}`
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
