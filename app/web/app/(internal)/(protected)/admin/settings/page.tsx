import Link from 'next/link'

export default async function AdminSettingsPage() {
	return (
		<div>
			<Link href="/admin/settings/rbac">RBAC</Link>
			<Link href="/admin/settings/chart">Настройки графика</Link>
		</div>
	)
}
