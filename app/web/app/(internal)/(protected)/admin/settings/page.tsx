import type { PermissionKey } from '@bio-exam/rbac'

import type { Metadata } from 'next'

import { SectionDeniedState } from '@/components/auth/SectionGate'
import { SectionCard } from '@/components/navigation/SectionCard'
import { sectionDescription, settingsSections } from '@/lib/navigation/sections'
import { sectionAccess } from '@/lib/session/section-access'

export const metadata: Metadata = { title: 'Настройки' }

export default async function AdminSettingsPage() {
	const access = await sectionAccess('settings')
	if (access.kind === 'anonymous') return null
	if (access.kind === 'denied') return <SectionDeniedState />

	const perms = new Set<PermissionKey>(access.me.perms)
	const sections = settingsSections(perms)

	return (
		<main className="space-y-unit">
			<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
				<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">система</p>
				<h1 className="mt-2 font-serif text-4xl leading-none text-foreground tab-sm:text-5xl">Настройки</h1>
			</section>
			<div className="grid gap-4 tab-sm:grid-cols-2 tab:grid-cols-3">
				{sections.map((section) => (
					<SectionCard key={section.href} section={section} description={sectionDescription(perms, section)} />
				))}
			</div>
		</main>
	)
}
