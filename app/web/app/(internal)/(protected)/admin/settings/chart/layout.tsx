import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminChartSettingsLayout({ children }: { children: React.ReactNode }) {
	const me = await requireSectionAccess('settings')
	if (!me) return null
	return <>{children}</>
}
