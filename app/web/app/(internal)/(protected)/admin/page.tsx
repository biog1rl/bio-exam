import Tiles from '@/components/Tiles'

type AdminItem = {
	href: string
	name: string
}

export default function AdminPage() {
	const adminItems: AdminItem[] = [
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
	]

	return <Tiles items={adminItems} />
}
