import { can } from '@bio-exam/rbac'

import { notFound, redirect } from 'next/navigation'

import { buildLoginRedirect } from '@/lib/session/redirect'
import { getServerMe, requireServerData, serverRequest } from '@/lib/session/server'
import { parseUserEnvelope } from '@/lib/users/api'

export default async function AdminUserPageRedirect({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const currentPath = `/admin/users/${encodeURIComponent(id)}`
	const me = await getServerMe()

	if (!me) {
		redirect(buildLoginRedirect(currentPath))
	}

	if (!can(new Set(me.perms), 'tests.manage_assignments')) {
		notFound()
	}

	const user = requireServerData(
		await serverRequest(`/api/users/${encodeURIComponent(id)}`, { parse: parseUserEnvelope }),
		currentPath
	)
	if (!user.login) {
		notFound()
	}

	redirect(`/profile/${encodeURIComponent(user.login)}`)
}
