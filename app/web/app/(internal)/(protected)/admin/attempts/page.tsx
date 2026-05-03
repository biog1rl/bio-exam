import { cookies } from 'next/headers'

import { absoluteUrl } from '@/lib/http/absoluteUrl'

import { AdminAttemptsClient } from './AdminAttemptsClient'
import type { AdminAttemptsResponse } from './attempts-types'

async function fetchAdminAttempts(): Promise<AdminAttemptsResponse | null> {
	try {
		const cookieStorage = await cookies()
		const cookieHeader = cookieStorage.toString()
		const url = await absoluteUrl('/api/tests/admin/attempts?limit=100')

		const res = await fetch(url, {
			method: 'GET',
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			cache: 'no-store',
		})

		if (!res.ok) return null
		return (await res.json()) as AdminAttemptsResponse
	} catch {
		return null
	}
}

export default async function AdminAttemptsPage() {
	const data = await fetchAdminAttempts()

	return <AdminAttemptsClient rows={data?.rows ?? []} total={data?.total ?? 0} />
}
