import { can } from '@bio-exam/rbac'

import { notFound, redirect } from 'next/navigation'

import UserProfileAssignmentsPage from '@/components/users/UserProfileAssignmentsPage'
import { buildLoginRedirect } from '@/lib/session/redirect'
import { getServerMe } from '@/lib/session/server'

export default async function ProfileByIdPage({ params }: { params: Promise<{ id: string }> }) {
	const { id: login } = await params
	const me = await getServerMe()

	if (!me) {
		redirect(buildLoginRedirect(`/profile/${encodeURIComponent(login)}`))
	}

	if (!can(new Set(me.perms), 'tests.manage_assignments')) {
		notFound()
	}

	return <UserProfileAssignmentsPage login={login} />
}
