import type { PermissionKey } from '@bio-exam/rbac'

import type { Metadata } from 'next'

import { SectionDeniedState } from '@/components/auth/SectionGate'
import { SectionCard } from '@/components/navigation/SectionCard'
import { PageHeader } from '@/components/page/PageHeader'
import { sectionAccess } from '@/lib/navigation/section-access'
import { sectionDescription, settingsSections } from '@/lib/navigation/sections'

export const metadata: Metadata = { title: 'Настройки' }

export default async function AdminSettingsPage() {
	const access = await sectionAccess('settings')
	if (access.kind === 'anonymous') return null
	if (access.kind === 'denied') return <SectionDeniedState />

	const perms = new Set<PermissionKey>(access.me.perms)
	const sections = settingsSections(perms)

	return (
		<main className="space-y-6">
			<PageHeader title="Настройки" />
			<div className="grid gap-4 tab-sm:grid-cols-2 tab:grid-cols-3">
				{sections.map((section) => (
					<SectionCard
						key={section.href}
						section={section}
						description={sectionDescription(perms, section)}
						headingLevel={2}
					/>
				))}
			</div>
		</main>
	)
}
