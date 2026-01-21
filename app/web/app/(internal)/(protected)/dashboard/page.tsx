import Tiles from '@/components/Tiles'

export default function DashboardPage() {
	const panelItems = [
		{
			href: '/docs',
			name: 'DOC.',
		},
		{
			href: '/workload',
			name: 'WRK.',
		},
		{
			href: '/projects',
			name: 'PRJ.',
		},
	]

	return <Tiles items={panelItems} />
}
