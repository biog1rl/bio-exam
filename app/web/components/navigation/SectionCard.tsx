import Link from 'next/link'

import type { NavSection } from '@/lib/navigation/sections'

import { NAV_ICONS } from './nav-icons'

export function SectionCard({ section, description }: { section: NavSection; description: string }) {
	const Icon = NAV_ICONS[section.icon]
	return (
		<Link
			href={section.href}
			className="group flex min-h-40 flex-col justify-between gap-6 rounded-4xl border border-border/80 bg-card/90 p-unit-mob transition-colors hover:border-primary/45 hover:bg-secondary/55 focus-visible:border-primary focus-visible:bg-secondary/55 focus-visible:outline-none tab-sm:p-unit"
		>
			<div className="flex items-start justify-between gap-4">
				<h3 className="font-serif text-3xl leading-none text-foreground transition-colors group-hover:text-primary">
					{section.title}
				</h3>
				<div className="rounded-3xl border border-border/70 bg-secondary/55 p-3 transition-colors group-hover:border-primary/35 group-hover:bg-card">
					<Icon
						className="size-6 text-muted-foreground transition-colors group-hover:text-primary"
						aria-hidden="true"
					/>
				</div>
			</div>
			<p className="max-w-xl text-base leading-7 text-muted-foreground">{description}</p>
		</Link>
	)
}
