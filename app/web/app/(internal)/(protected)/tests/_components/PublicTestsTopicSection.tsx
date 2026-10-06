import { StackedAccordionContent, StackedAccordionTrigger } from '@/components/ui/stacked-accordion'

import { PublicTestCard } from './PublicTestCard'
import { countLabel, type PublicTestsTopicGroup } from './tests-page-utils'

export function PublicTestsTopicSection({ group }: { group: PublicTestsTopicGroup }) {
	return (
		<>
			<StackedAccordionTrigger>
				<span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
					<span className="font-serif text-xl leading-tight [overflow-wrap:anywhere] text-foreground">
						{group.topicTitle}
					</span>
					<span className="text-sm font-normal text-muted-foreground">
						{countLabel(group.tests.length, { one: 'тест', few: 'теста', many: 'тестов' })}
					</span>
				</span>
			</StackedAccordionTrigger>

			<StackedAccordionContent className="grid gap-3 pt-2 mob:grid-cols-2 tab:grid-cols-3 xl:grid-cols-4">
				{group.tests.map((test) => (
					<PublicTestCard key={test.id} test={test} />
				))}
			</StackedAccordionContent>
		</>
	)
}
