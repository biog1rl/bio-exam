import Tiles, { TilesItem } from '@/components/Tiles'
import { requireSectionAccess } from '@/lib/session/section-access'

export default async function AdminSettingsPage() {
	const me = await requireSectionAccess('settings')
	if (!me) return null

	const adminItems: TilesItem[] = [
		{
			href: '/admin/settings/rbac',
			name: 'RBAC',
		},
		{
			href: '/admin/settings/chart',
			name: 'Настройки графика',
		},
	]

	return <Tiles items={adminItems} />
}
