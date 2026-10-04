import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminGroupsLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('groups')
	if (!me) return null
	return <>{children}</>
}
