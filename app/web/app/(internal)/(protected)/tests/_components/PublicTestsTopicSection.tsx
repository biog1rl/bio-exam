import { BookOpen, Clock3, FileText } from 'lucide-react'

import { StackedAccordionContent, StackedAccordionTrigger } from '@/components/ui/stacked-accordion'

import { PublicTestCard } from './PublicTestCard'
import type { PublicTestsTopicGroup } from './tests-page-utils'

export function PublicTestsTopicSection({ group }: { group: PublicTestsTopicGroup }) {
	return (
		<>
			<StackedAccordionTrigger>
				<div className="flex flex-col gap-4 tab-sm:flex-row tab-sm:items-end tab-sm:justify-between">
					<div>
						<p className="font-mono text-[0.6875rem] tracking-[0.22em] text-muted-foreground uppercase">
							{group.topicSlug}
						</p>
						<h2 className="mt-2 font-serif text-3xl leading-tight">{group.topicTitle}</h2>
					</div>
					<div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
						<span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1">
							<BookOpen className="size-3.5" />
							{group.tests.length} тестов
						</span>
						<span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1">
							<FileText className="size-3.5" />
							{group.questionsCount} вопросов
						</span>
						<span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1">
							<Clock3 className="size-3.5" />
							{group.timedTests} с таймером
						</span>
					</div>
				</div>
			</StackedAccordionTrigger>

			<StackedAccordionContent className="grid gap-3 pt-2 mob:grid-cols-2 tab:grid-cols-3 xl:grid-cols-4">
				{group.tests.map((test) => (
					<PublicTestCard key={test.id} test={test} />
				))}
			</StackedAccordionContent>
		</>
	)
}
