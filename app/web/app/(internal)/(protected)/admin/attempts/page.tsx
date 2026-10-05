import { requireServerData, serverRequest } from '@/lib/session/server'
import { DEFAULT_ATTEMPTS_FILTERS, adminTestsKeys, parseAdminAttempts } from '@/lib/tests/admin-api'

import { AdminAttemptsClient } from './AdminAttemptsClient'

export default async function AdminAttemptsPage() {
	const initialKey = adminTestsKeys.attempts(DEFAULT_ATTEMPTS_FILTERS)
	const initial = requireServerData(await serverRequest(initialKey, { parse: parseAdminAttempts }), '/admin/attempts')

	return <AdminAttemptsClient initial={initial} initialKey={initialKey} />
}
