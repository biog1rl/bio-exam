import type { PermissionKey } from '@bio-exam/rbac'

import { SectionCard } from '@/components/navigation/SectionCard'
import { adminHeroText, sectionsCountLabel } from '@/lib/admin/sections'
import { adminHubGroups, sectionDescription } from '@/lib/navigation/sections'
import { getServerMe } from '@/lib/session/server'

export const metadata = { title: 'Панель управления' }

export default async function AdminPage() {
	const me = await getServerMe()
	if (!me) return null

	const perms = new Set<PermissionKey>(me.perms)
	const groups = adminHubGroups(perms)
	const count = groups.reduce((sum, group) => sum + group.sections.length, 0)

	return (
		<main className="space-y-unit">
			<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
				<div className="flex flex-col gap-unit tab:flex-row tab:items-end tab:justify-between">
					<div className="max-w-3xl">
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">управление</p>
						<h1 className="mt-2 font-serif text-4xl leading-none text-foreground tab-sm:text-5xl">Панель управления</h1>
						<p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{adminHeroText(perms)}</p>
					</div>

					<div className="rounded-3xl border border-border/70 bg-secondary/55 p-4">
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">доступно</p>
						<p className="mt-2 font-serif text-2xl leading-none">{sectionsCountLabel(count)}</p>
					</div>
				</div>
			</section>

			{groups.map((group) => (
				<section key={group.key} aria-labelledby={`admin-${group.key}`} className="space-y-4">
					<h2 id={`admin-${group.key}`} className="font-serif text-3xl leading-none">
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
