import { requireSectionAccess } from '@/lib/session/section-access'

export default async function RBACLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('rbac')
	if (!me) return null
	return <>{children}</>
}
