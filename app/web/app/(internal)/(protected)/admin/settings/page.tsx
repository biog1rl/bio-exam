import Tiles, { TilesItem } from '@/components/Tiles'

export default async function AdminSettingsPage() {
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
