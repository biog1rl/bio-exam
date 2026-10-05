import type { PermissionKey } from '@bio-exam/rbac'

import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { NAV_ICONS } from '@/components/navigation/nav-icons'
import { sectionDescription, siteMapGroups } from '@/lib/navigation/sections'
import { getServerMe } from '@/lib/session/server'

export const metadata: Metadata = { title: 'Карта сайта' }

export default async function SiteMapPage() {
	const me = await getServerMe()
	if (!me) return null

	const perms = new Set<PermissionKey>(me.perms)
	const groups = siteMapGroups(perms)

	return (
		<main className="space-y-unit">
			<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
				<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">навигация</p>
				<h1 className="mt-2 font-serif text-4xl leading-none text-foreground tab-sm:text-5xl">Карта сайта</h1>
				<p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
					Все разделы, которые вам доступны. Отдельные тесты, попытки и профили открываются из этих разделов.
				</p>
			</section>

			{groups.map((group) => (
				<section
					key={group.key}
					aria-labelledby={`sitemap-${group.key}`}
					className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit"
				>
					<h2 id={`sitemap-${group.key}`} className="font-serif text-3xl leading-none">
						{group.title}
					</h2>
					<ul className="mt-unit grid gap-3 tab-sm:grid-cols-2 tab:grid-cols-3">
						{group.sections.map((section) => {
							const Icon = NAV_ICONS[section.icon]
							return (
								<li key={section.href}>
									<Link
										href={section.href}
										className="group flex h-full flex-col justify-between gap-3 rounded-3xl border border-border/70 bg-secondary/45 px-4 py-4 transition-colors hover:border-primary/45 hover:bg-secondary/75 focus-visible:border-primary focus-visible:bg-secondary/75 focus-visible:outline-none"
									>
										<span className="flex items-center justify-between gap-3">
											<span className="flex items-center gap-3">
												<Icon
													className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
													aria-hidden="true"
												/>
												<span className="font-serif text-2xl leading-none transition-colors group-hover:text-primary">
													{section.title}
												</span>
											</span>
											<ArrowRight
												className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
												aria-hidden="true"
											/>
										</span>
										<span className="text-sm leading-6 text-muted-foreground">
											{sectionDescription(perms, section)}
										</span>
									</Link>
								</li>
							)
						})}
					</ul>
				</section>
			))}
		</main>
	)
}
