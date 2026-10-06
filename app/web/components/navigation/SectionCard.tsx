import Link from 'next/link'

import type { NavSection } from '@/lib/navigation/sections'

import { NAV_ICONS } from './nav-icons'

interface SectionCardProps {
	section: NavSection
	description: string
	headingLevel?: 2 | 3
}

export function SectionCard({ section, description, headingLevel = 3 }: SectionCardProps) {
	const Icon = NAV_ICONS[section.icon]
	const Heading = headingLevel === 2 ? 'h2' : 'h3'
	return (
		<Link
			href={section.href}
			className="group flex min-h-32 flex-col justify-between gap-4 rounded-3xl border border-border/80 bg-card p-5 shadow-sm transition-colors hover:border-primary/45 hover:bg-secondary/55 focus-visible:border-primary focus-visible:bg-secondary/55 focus-visible:outline-none"
		>
			<div className="flex items-start justify-between gap-4">
				<Heading className="text-base leading-snug font-semibold text-foreground transition-colors group-hover:text-primary">
					{section.title}
				</Heading>
				<div className="rounded-2xl border border-border/70 bg-secondary/55 p-2 transition-colors group-hover:border-primary/35 group-hover:bg-card">
					<Icon
						className="size-5 text-muted-foreground transition-colors group-hover:text-primary"
						aria-hidden="true"
					/>
				</div>
			</div>
			<p className="text-sm leading-6 text-muted-foreground">{description}</p>
		</Link>
	)
}
