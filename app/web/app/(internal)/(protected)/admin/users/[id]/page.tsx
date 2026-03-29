import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { getServerMe } from '@/lib/auth/getServerMe'
import { buildLoginRedirectPath } from '@/lib/auth/loginRedirect'
import { absoluteUrl } from '@/lib/http/absoluteUrl'

type UserLite = {
	id: string
	login: string | null
}

async function resolveLoginByUserId(userId: string): Promise<string | null> {
	try {
		const cookieStorage = await cookies()
		const cookieHeader = cookieStorage.toString()
		const url = await absoluteUrl('/api/users')

		const res = await fetch(url, {
			method: 'GET',
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			cache: 'no-store',
		})
		if (!res.ok) return null

		const json = (await res.json()) as { users?: UserLite[] }
		const user = (json.users ?? []).find((u) => u.id === userId)
		return user?.login ?? null
	} catch {
		return null
	}
}

export default async function AdminUserPageRedirect({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const me = await getServerMe()

	if (!me) {
		redirect(buildLoginRedirectPath(`/admin/users/${encodeURIComponent(id)}`))
	}

	const isAdmin = me.roles?.includes('admin') ?? false
	if (!isAdmin) {
		notFound()
	}

	const login = await resolveLoginByUserId(id)
	if (!login) {
		notFound()
	}

	redirect(`/profile/${encodeURIComponent(login)}`)
}
