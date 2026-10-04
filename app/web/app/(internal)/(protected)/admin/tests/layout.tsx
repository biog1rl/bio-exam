import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminTestsLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('tests')
	if (!me) return null
	return <>{children}</>
}
