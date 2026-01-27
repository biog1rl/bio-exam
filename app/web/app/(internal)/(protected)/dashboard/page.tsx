import Tiles from '@/components/Tiles'

export default function DashboardPage() {
	const panelItems = [
		{ href: '/dashboard', name: 'Дашборд' },
		{ href: '/admin', name: 'Админка' },
		{ href: '/admin/tests', name: 'Тесты' },
	]

	return <Tiles items={panelItems} />
}
