import { requireServerData, serverRequest } from '@/lib/session/server'
import { DEFAULT_ATTEMPTS_FILTERS, adminTestsKeys, parseAdminAttempts } from '@/lib/tests/admin-api'
import { attemptsUrl, parseAttemptsUrl } from '@/lib/tests/attempts-url'

import { AdminAttemptsClient } from './AdminAttemptsClient'

export const metadata = { title: 'Попытки' }

export default async function AdminAttemptsPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
	const urlFilters = parseAttemptsUrl(await searchParams)
	const initialKey = adminTestsKeys.attempts({ ...DEFAULT_ATTEMPTS_FILTERS, ...urlFilters })
	const initial = requireServerData(
		await serverRequest(initialKey, { parse: parseAdminAttempts }),
		attemptsUrl(urlFilters)
	)

	return <AdminAttemptsClient initial={initial} initialKey={initialKey} />
}
