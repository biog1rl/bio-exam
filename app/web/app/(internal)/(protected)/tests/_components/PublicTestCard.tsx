import { ArrowRight, FileText, Timer, Trophy } from 'lucide-react'
import Link from 'next/link'

import { formatPercent } from '@/lib/tests/format'
import type { PublicTestListItem } from '@/lib/tests/types'

export function PublicTestCard({ test }: { test: PublicTestListItem }) {
	return (
		<Link
			href={`/tests/${test.topicSlug}/${test.slug}`}
			className="bg-card/75 p-unit hover:bg-secondary/55 focus-visible:border-primary rounded-lg border outline-none transition-colors"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h3 className="text-foreground font-serif text-2xl leading-tight">{test.title}</h3>
					{test.description ? (
						<p className="text-muted-foreground mt-3 line-clamp-2 text-sm leading-6">{test.description}</p>
					) : null}
				</div>
				<ArrowRight className="text-primary mt-1 size-5 shrink-0" />
			</div>

			<div className="text-muted-foreground mt-6 flex flex-wrap gap-2 text-sm">
				<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
					<FileText className="size-3.5" />
					{test.questionsCount} вопросов
				</span>
				<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
					<Timer className="size-3.5" />
					{test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : 'без таймера'}
				</span>
				{test.passingScore != null ? (
					<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
						<Trophy className="size-3.5" />
						{formatPercent(test.passingScore)}
					</span>
				) : null}
			</div>
		</Link>
	)
}
