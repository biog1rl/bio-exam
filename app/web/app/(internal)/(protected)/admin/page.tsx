import type { PermissionKey } from '@bio-exam/rbac'

import { SectionCard } from '@/components/navigation/SectionCard'
import { PageHeader } from '@/components/page/PageHeader'
import { adminHubGroups, sectionDescription } from '@/lib/navigation/sections'
import { getServerMe } from '@/lib/session/server'

export const metadata = { title: 'Панель управления' }

export default async function AdminPage() {
	const me = await getServerMe()
	if (!me) return null

	const perms = new Set<PermissionKey>(me.perms)
	const groups = adminHubGroups(perms)

	return (
		<main className="space-y-8">
			<PageHeader title="Панель управления" />

			{groups.map((group) => (
				<section key={group.key} aria-labelledby={`admin-${group.key}`} className="space-y-3">
					<h2 id={`admin-${group.key}`} className="font-serif text-xl leading-tight text-foreground">
						{group.title}
					</h2>
					<div className="grid gap-4 tab-sm:grid-cols-2 tab:grid-cols-3">
						{group.sections.map((section) => (
							<SectionCard key={section.href} section={section} description={sectionDescription(perms, section)} />
						))}
					</div>
				</section>
			))}
		</main>
	)
}
