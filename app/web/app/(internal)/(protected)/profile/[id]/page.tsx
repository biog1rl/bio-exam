import { notFound, redirect } from 'next/navigation'

import UserProfileAssignmentsPage from '@/components/users/UserProfileAssignmentsPage'
import { getServerMe } from '@/lib/auth/getServerMe'
import { buildLoginRedirect } from '@/lib/session/redirect'

export default async function ProfileByIdPage({ params }: { params: Promise<{ id: string }> }) {
	const { id: login } = await params
	const me = await getServerMe()

	if (!me) {
		redirect(buildLoginRedirect(`/profile/${encodeURIComponent(login)}`))
	}

	const isAdmin = me.roles?.includes('admin') ?? false

	if (!isAdmin) {
		notFound()
	}

	return <UserProfileAssignmentsPage login={login} />
}
