import { requireServerData, serverRequest } from '@/lib/session/server'

import { AdminAttemptsClient } from './AdminAttemptsClient'
import type { AdminAttemptsResponse } from './attempts-types'

function parseAdminAttempts(body: unknown): AdminAttemptsResponse {
	if (!body || typeof body !== 'object') throw new Error('Malformed attempts response')
	const record = body as Record<string, unknown>
	if (!Array.isArray(record.rows) || typeof record.total !== 'number') {
		throw new Error('Malformed attempts response')
	}
	return body as AdminAttemptsResponse
}

export default async function AdminAttemptsPage() {
	const data = requireServerData(
		await serverRequest('/api/tests/admin/attempts?limit=100', { parse: parseAdminAttempts }),
		'/admin/attempts'
	)

	return <AdminAttemptsClient rows={data.rows} total={data.total} />
}
