import { notFound, redirect } from 'next/navigation'

import UserProfileAssignmentsPage from '@/components/users/UserProfileAssignmentsPage'
import { getServerMe } from '@/lib/auth/getServerMe'
import { buildLoginRedirectPath } from '@/lib/auth/loginRedirect'

export default async function ProfileByIdPage({ params }: { params: Promise<{ id: string }> }) {
	const { id: login } = await params
	const me = await getServerMe()

	if (!me) {
		redirect(buildLoginRedirectPath(`/profile/${encodeURIComponent(login)}`))
	}

	const isAdmin = me.roles?.includes('admin') ?? false

	if (!isAdmin) {
		notFound()
	}

	return <UserProfileAssignmentsPage login={login} />
}
