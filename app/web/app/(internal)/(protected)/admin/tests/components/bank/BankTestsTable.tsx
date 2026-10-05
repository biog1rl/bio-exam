import type { ReactNode } from 'react'

import { format, isValid, parseISO } from 'date-fns'
import { Download, Edit, Eye, MoreHorizontal, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { SortableHead } from '@/components/table/SortableHead'
import { useRowLink } from '@/components/table/use-row-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { nextBankSort, type BankSort, type BankSortKey } from '@/lib/tests/bank-table'
import { sortDirectionOf } from '@/lib/utils/table-sort'

import type { Test } from '../../types'

interface BankTestsTableProps {
	tests: Test[]
	showTopic: boolean
	sort: BankSort
	onSortChange: (sort: BankSort) => void
	statusFilter: ReactNode
	onExport: (test: Test, withAnswers: boolean) => void
	onDelete: (test: Test) => void
}

function updatedDate(value: string): string {
	const parsed = parseISO(value)
	return isValid(parsed) ? format(parsed, 'dd.MM.yyyy') : '—'
}

function editorHref(test: Test): string {
	return `/admin/tests/${test.topicSlug}/${test.slug}`
}

function StatusBadge({ published }: { published: boolean }) {
	return (
		<Badge variant={published ? 'default' : 'secondary'} className="rounded-full">
			{published ? 'Опубликован' : 'Черновик'}
		</Badge>
	)
}

export function BankTestsTable({
	tests,
	showTopic,
	sort,
	onSortChange,
	statusFilter,
	onExport,
	onDelete,
}: BankTestsTableProps) {
	const rowLink = useRowLink()
	const head = (label: string, key: BankSortKey, className?: string, align?: 'left' | 'right') => (
		<SortableHead
			label={label}
			direction={sortDirectionOf(sort, key)}
			onSort={() => onSortChange(nextBankSort(sort, key))}
			className={className}
			align={align}
		/>
	)

	return (
		<div className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm">
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						{head('Название', 'title', 'pl-4')}
						{showTopic ? head('Тема', 'topic', 'hidden w-56 lg:table-cell') : null}
						<TableHead className="hidden w-32 tab-sm:table-cell">
							<span className="inline-flex items-center gap-1">
								Статус
								{statusFilter}
							</span>
						</TableHead>
						{head('Вопросы', 'questions', 'hidden w-24 mob:table-cell', 'right')}
						<TableHead className="hidden w-20 text-right xl:table-cell">Таймер</TableHead>
						{head('Обновлён', 'updated', 'hidden w-32 tab-sm:table-cell', 'right')}
						<TableHead className="w-14 pr-3">
							<span className="sr-only">Действия</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{tests.map((test) => (
						<TableRow key={test.id} className="cursor-pointer" {...rowLink(editorHref(test))}>
							<TableCell className="py-3 pl-4">
								<Link
									href={editorHref(test)}
									className="font-medium [overflow-wrap:anywhere] text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
								>
									{test.title}
								</Link>
								<p className="mt-0.5 text-xs text-muted-foreground tab-sm:hidden">
									{test.isPublished ? 'Опубликован' : 'Черновик'}
									{showTopic && test.topicTitle ? ` · ${test.topicTitle}` : null}
									<span className="mob:hidden"> · вопросов: {test.questionsCount ?? 0}</span>
								</p>
								{showTopic && test.topicTitle ? (
									<p className="mt-0.5 hidden text-xs text-muted-foreground tab-sm:block lg:hidden">
										{test.topicTitle}
									</p>
								) : null}
							</TableCell>
							{showTopic ? (
								<TableCell className="hidden truncate text-muted-foreground lg:table-cell">
									{test.topicTitle ?? '—'}
								</TableCell>
							) : null}
							<TableCell className="hidden tab-sm:table-cell">
								<StatusBadge published={test.isPublished} />
							</TableCell>
							<TableCell className="hidden text-right tabular-nums mob:table-cell">
								{test.questionsCount ?? 0}
							</TableCell>
							<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums xl:table-cell">
								{test.timeLimitMinutes ? `${test.timeLimitMinutes} мин` : '—'}
							</TableCell>
							<TableCell className="hidden text-right whitespace-nowrap text-muted-foreground tabular-nums tab-sm:table-cell">
								{updatedDate(test.updatedAt)}
							</TableCell>
							<TableCell className="pr-3">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											size="icon"
											variant="ghost"
											className="size-8 rounded-full"
											aria-label={`Действия с тестом ${test.title}`}
										>
											<MoreHorizontal className="size-4" aria-hidden="true" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem asChild>
											<Link href={editorHref(test)}>
												<Edit className="size-4" aria-hidden="true" />
												Открыть редактор
											</Link>
										</DropdownMenuItem>
										{test.isPublished ? (
											<DropdownMenuItem asChild>
												<Link href={`/tests/${test.topicSlug}/${test.slug}`}>
													<Eye className="size-4" aria-hidden="true" />
													Как видит ученик
												</Link>
											</DropdownMenuItem>
										) : null}
										<DropdownMenuSeparator />
										<DropdownMenuItem onSelect={() => onExport(test, false)}>
											<Download className="size-4" aria-hidden="true" />
											Экспорт без ответов
										</DropdownMenuItem>
										<DropdownMenuItem onSelect={() => onExport(test, true)}>
											<Download className="size-4" aria-hidden="true" />
											Экспорт с ответами
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="text-destructive focus:text-destructive"
											onSelect={() => onDelete(test)}
										>
											<Trash2 className="size-4" aria-hidden="true" />
											Удалить
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}
