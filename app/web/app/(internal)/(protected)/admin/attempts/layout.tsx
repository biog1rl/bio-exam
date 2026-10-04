import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminAttemptsLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('attempts')
	if (!me) return null
	return <>{children}</>
}
