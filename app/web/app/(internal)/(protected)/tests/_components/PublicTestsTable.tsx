import Link from 'next/link'

import { SortableHead } from '@/components/table/SortableHead'
import { TableCard } from '@/components/table/TableCard'
import { mainLinkClass } from '@/components/table/main-link'
import { useRowLink } from '@/components/table/use-row-link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatPercent } from '@/lib/tests/format'
import { countLabel, nextPublicSort, type PublicSort, type PublicSortKey } from '@/lib/tests/public-tests-table'
import type { PublicTestListItem } from '@/lib/tests/types'
import { sortDirectionOf } from '@/lib/utils/table-sort'

function testHref(test: PublicTestListItem) {
	return `/tests/${test.topicSlug}/${test.slug}`
}

function metaLine(test: PublicTestListItem, showTopic: boolean) {
	return [
		showTopic ? test.topicTitle : null,
		countLabel(test.questionsCount, { one: 'вопрос', few: 'вопроса', many: 'вопросов' }),
		test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : null,
	]
		.filter(Boolean)
		.join(' · ')
}

export function PublicTestsTable({
	tests,
	showTopic,
	sort,
	onSortChange,
}: {
	tests: PublicTestListItem[]
	showTopic: boolean
	sort: PublicSort
	onSortChange: (sort: PublicSort) => void
}) {
	const rowLink = useRowLink()
	const head = (label: string, key: PublicSortKey, className?: string) => (
		<SortableHead
			label={label}
			direction={sortDirectionOf(sort, key)}
			onSort={() => onSortChange(nextPublicSort(sort, key))}
			className={className}
		/>
	)

	return (
		<TableCard>
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						{head('Тест', 'title', 'pl-4')}
						{showTopic ? head('Тема', 'topic', 'hidden w-56 lg:table-cell') : null}
						<TableHead className="hidden w-24 text-right tab-sm:table-cell">Вопросы</TableHead>
						<TableHead className="hidden w-24 text-right tab-sm:table-cell">Таймер</TableHead>
						<TableHead className="hidden w-28 pr-4 text-right tab-sm:table-cell">Проходной</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{tests.map((test) => (
						<TableRow key={test.id} className="cursor-pointer" {...rowLink(testHref(test))}>
							<TableCell className="py-3 pl-4">
								<Link href={testHref(test)} className={mainLinkClass}>
									{test.title}
								</Link>
								{test.description ? (
									<p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{test.description}</p>
								) : null}
								<p className="mt-0.5 text-xs text-muted-foreground tab-sm:hidden">{metaLine(test, showTopic)}</p>
								{showTopic ? (
									<p className="mt-0.5 hidden text-xs text-muted-foreground tab-sm:block lg:hidden">
										{test.topicTitle}
									</p>
								) : null}
							</TableCell>
							{showTopic ? (
								<TableCell className="hidden truncate text-muted-foreground lg:table-cell">{test.topicTitle}</TableCell>
							) : null}
							<TableCell className="hidden text-right tabular-nums tab-sm:table-cell">{test.questionsCount}</TableCell>
							<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
								{test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : '—'}
							</TableCell>
							<TableCell className="hidden pr-4 text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
								{test.passingScore != null ? formatPercent(test.passingScore) : '—'}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableCard>
	)
}
