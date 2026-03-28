import Tiles, { TilesItem } from '@/components/Tiles'

export default function AdminPage() {
	const adminItems: TilesItem[] = [
		{
			href: '/admin/tests',
			name: 'Тесты',
		},
		{
			href: '/admin/users',
			name: 'Пользователи',
		},
		{
			href: '/admin/settings',
			name: 'Настройки',
		},
		{
			href: '/admin/groups',
			name: 'Группы',
		},
	]

	return <Tiles items={adminItems} />
}
