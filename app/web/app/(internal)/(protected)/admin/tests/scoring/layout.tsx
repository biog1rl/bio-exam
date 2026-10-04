import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminScoringLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('catalog')
	if (!me) return null
	return <>{children}</>
}
