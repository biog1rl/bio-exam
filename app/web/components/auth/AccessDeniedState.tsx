import type { Ref } from 'react'

import { ArrowLeft, ShieldOff, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

interface AccessDeniedStateProps {
	title: string
	description: string
	backHref?: string
	backLabel?: string
	icon?: LucideIcon
	kicker?: string
	headingRef?: Ref<HTMLHeadingElement>
}

export function AccessDeniedState({
	title,
	description,
	backHref,
	backLabel,
	icon: Icon = ShieldOff,
	kicker = 'нет доступа',
	headingRef: heading,
}: AccessDeniedStateProps) {
	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit">
			<Icon className="size-7 text-muted-foreground" aria-hidden="true" />
			<p className="mt-4 font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">{kicker}</p>
			<h1
				ref={heading}
				tabIndex={heading ? -1 : undefined}
				className={cn('mt-2 font-serif text-3xl leading-tight break-words', heading ? 'outline-none' : undefined)}
			>
				{title}
			</h1>
			<p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
			{backHref ? (
				<div className="mt-8 flex flex-wrap gap-2">
					<Button variant="outline" asChild className="w-full rounded-full bg-card mob:w-auto">
						<Link href={backHref}>
							<ArrowLeft className="size-4" aria-hidden="true" />
							{backLabel}
						</Link>
					</Button>
				</div>
			) : null}
		</section>
	)
}
