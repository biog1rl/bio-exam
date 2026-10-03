import { ArrowLeft, Plus } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

interface TopicEmptyStateProps {
	title: string
	description: string
	showCreateAction?: boolean
}

export function TopicEmptyState({ title, description, showCreateAction = false }: TopicEmptyStateProps) {
	return (
		<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob shadow-sm tab-sm:p-unit">
			<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">пусто</p>
			<h2 className="mt-2 font-serif text-3xl">{title}</h2>
			<p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
			<div className="mt-7 flex flex-wrap gap-2">
				<Button variant="outline" asChild className="rounded-full bg-card">
					<Link href="/admin/tests">
						<ArrowLeft className="size-4" />К темам
					</Link>
				</Button>
				{showCreateAction ? (
					<Button asChild className="rounded-full">
						<Link href="/admin/tests/new">
							<Plus className="size-4" />
							Новый тест
						</Link>
					</Button>
				) : null}
			</div>
		</section>
	)
}
