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
		<section className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit border shadow-sm">
			<p className="text-muted-foreground font-mono text-[11px] uppercase tracking-[0.22em]">пусто</p>
			<h2 className="mt-2 font-serif text-3xl">{title}</h2>
			<p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">{description}</p>
			<div className="mt-7 flex flex-wrap gap-2">
				<Button variant="outline" asChild className="bg-card rounded-full">
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
