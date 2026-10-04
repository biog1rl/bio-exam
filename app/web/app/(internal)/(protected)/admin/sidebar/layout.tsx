import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminSidebarLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('sidebar')
	if (!me) return null
	return <>{children}</>
}
