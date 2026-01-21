import Tiles from '@/components/Tiles'

type AdminItem = {
	href: string
	name: string
}

export default function AdminPage() {
	const adminItems: AdminItem[] = [
		{
			href: '/admin/users',
			name: 'USRS.',
		},
		{
			href: '/admin/settings',
			name: 'STNG.',
		},
		{
			href: '/employees',
			name: 'EMPL.',
		},
	]

	return <Tiles items={adminItems} />
}
