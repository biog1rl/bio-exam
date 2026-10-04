import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('users')
	if (!me) return null
	return <>{children}</>
}
