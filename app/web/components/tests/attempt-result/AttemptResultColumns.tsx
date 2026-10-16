import type { ReactNode } from 'react'

import { ClipboardCheck } from 'lucide-react'

import { TableCell, TableHead } from '@/components/ui/table'
import type { AttemptResultView } from '@/lib/tests/attempt-result-view'
import { cn } from '@/lib/utils/cn'

import { AttemptReviewMark } from './AttemptReviewMark'
import { AttemptPoints, AttemptScore, AttemptVerdict } from './AttemptScore'

export type AttemptColumnsFrom = 'tab-sm' | 'lg'

const FROM = {
	'tab-sm': {
		cell: 'tab-sm:table-cell',
		inline: 'tab-sm:inline-flex',
		hide: 'tab-sm:hidden',
		wide: 'tab-sm:w-28',
		readable: 'tab-sm:not-sr-only',
	},
	lg: {
		cell: 'lg:table-cell',
		inline: 'lg:inline-flex',
		hide: 'lg:hidden',
		wide: 'lg:w-28',
		readable: 'lg:not-sr-only',
	},
} as const

export function AttemptResultHeads({
	from = 'tab-sm',
	resultHead,
	statusFilter,
	reviewFilter,
}: {
	from?: AttemptColumnsFrom
	resultHead?: ReactNode
	statusFilter?: ReactNode
	reviewFilter?: ReactNode
}) {
	const at = FROM[from]
	return (
		<>
			<TableHead className={cn('hidden w-24 text-right', at.cell)}>Баллы</TableHead>
			{resultHead ?? <TableHead className="w-26 text-right">Результат</TableHead>}
			<TableHead className={cn('hidden w-32', at.cell)}>
				{statusFilter ? (
					<span className="inline-flex items-center gap-1">
						Статус
						{statusFilter}
					</span>
				) : (
					'Статус'
				)}
			</TableHead>
			<TableHead className={cn('w-14 pr-4 text-center', at.wide)}>
				<span className="inline-flex items-center justify-center gap-1">
					<ClipboardCheck className={cn('size-4', at.hide)} aria-hidden="true" />
					<span className={cn('sr-only', at.readable)}>Проверка</span>
					{reviewFilter ? <span className={cn('hidden', at.inline)}>{reviewFilter}</span> : null}
				</span>
			</TableHead>
		</>
	)
}

export function AttemptResultCells({ view, from = 'tab-sm' }: { view: AttemptResultView; from?: AttemptColumnsFrom }) {
	const at = FROM[from]
	return (
		<>
			<TableCell className={cn('hidden py-3', at.cell)}>
				<AttemptPoints view={view} />
			</TableCell>
			<TableCell className="py-3 text-right">
				<AttemptScore view={view} />
			</TableCell>
			<TableCell className={cn('hidden py-3', at.cell)}>
				<AttemptVerdict view={view} />
			</TableCell>
			<TableCell className="py-3 pr-4 text-center">
				<AttemptReviewMark view={view} />
			</TableCell>
		</>
	)
}
