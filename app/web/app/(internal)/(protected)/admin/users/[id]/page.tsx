import { can } from '@bio-exam/rbac'

import { MailQuestion } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'

import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
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
		const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || 'Пользователь'
		return (
			<div>
				<AccessDeniedState
					kicker="приглашение"
					icon={MailQuestion}
					title={name}
					description="Пользователь ещё не принял приглашение: логина и профиля пока нет. Ссылку на приглашение можно отправить заново из списка пользователей."
					backHref="/admin/users"
					backLabel="К пользователям"
				/>
			</div>
		)
	}

	redirect(`/profile/${encodeURIComponent(user.login)}`)
}
