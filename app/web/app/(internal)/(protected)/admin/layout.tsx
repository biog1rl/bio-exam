import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('admin')
	if (!me) return null
	return <>{children}</>
}
