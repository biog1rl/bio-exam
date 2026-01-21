import Link from 'next/link'

export default async function AdminSettingsPage() {
	return (
		<div>
			<Link href="/admin/settings/rbac">RBAC</Link>
		</div>
	)
}
