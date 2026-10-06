import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { formatPercent } from '@/lib/tests/format'
import type { PublicTestListItem } from '@/lib/tests/types'

import { countLabel } from './tests-page-utils'

function testFacts(test: PublicTestListItem): string {
	const facts = [
		countLabel(test.questionsCount, { one: 'вопрос', few: 'вопроса', many: 'вопросов' }),
		test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : 'без таймера',
	]
	if (test.passingScore != null) facts.push(`проходной ${formatPercent(test.passingScore)}`)
	return facts.join(' · ')
}

export function PublicTestCard({ test }: { test: PublicTestListItem }) {
	return (
		<Link
			href={`/tests/${test.topicSlug}/${test.slug}`}
			className="group flex flex-col gap-1.5 rounded-3xl border border-border/80 bg-card px-4 py-3 transition-colors outline-none hover:bg-secondary/55 focus-visible:ring-2 focus-visible:ring-ring"
		>
			<span className="flex items-start justify-between gap-3">
				<span className="font-medium [overflow-wrap:anywhere] text-foreground">{test.title}</span>
				<ArrowRight
					className="mt-0.5 size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
					aria-hidden="true"
				/>
			</span>
			{test.description ? <span className="line-clamp-2 text-sm text-muted-foreground">{test.description}</span> : null}
			<span className="mt-auto pt-1 text-xs text-muted-foreground tabular-nums">{testFacts(test)}</span>
		</Link>
	)
}
