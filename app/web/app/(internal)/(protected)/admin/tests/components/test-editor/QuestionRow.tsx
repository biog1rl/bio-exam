'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import {
	CheckSquare,
	Edit,
	GripVertical,
	ImageIcon,
	List,
	ListOrdered,
	MoreHorizontal,
	Radio,
	Trash2,
	Type,
} from 'lucide-react'
import Link from 'next/link'

import { useRowLink } from '@/components/table/use-row-link'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableCell, TableRow } from '@/components/ui/table'
import { questionPreview } from '@/lib/tests/question-preview'
import { cn } from '@/lib/utils/cn'

import type { Question } from '../../types'
import { pointsLabel, questionTypeTitle } from './test-editor-view'

interface QuestionRowProps {
	question: Question
	index: number
	editHref?: string
	sortable: boolean
	onEdit?: () => void
	onDelete: () => void
}

function QuestionTypeIcon({ template }: { template: string | null | undefined }) {
	const className = 'size-3.5 shrink-0'
	if (template === 'multi_choice') return <CheckSquare className={className} aria-hidden="true" />
	if (template === 'matching') return <List className={className} aria-hidden="true" />
	if (template === 'sequence_digits') return <ListOrdered className={className} aria-hidden="true" />
	if (template === 'short_text') return <Type className={className} aria-hidden="true" />
	return <Radio className={className} aria-hidden="true" />
}

function optionsSummary(question: Question): string {
	const template = question.questionUiTemplate ?? null
	if (template == null) return 'тип не настроен'
	if (template === 'matching') return `пар: ${question.matchingPairs?.left.length ?? 0}`
	if (template === 'short_text' || template === 'sequence_digits') return 'без вариантов'
	return `вариантов: ${question.options?.length ?? 0}`
}

export function questionRowId(question: Question): string {
	return question.id || `new-${question.order}`
}

export function QuestionRow({ question, index, editHref, sortable, onEdit, onDelete }: QuestionRowProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: questionRowId(question),
		disabled: !sortable,
	})

	const rowLink = useRowLink()
	const number = index + 1
	const typeTitle = questionTypeTitle(question)
	const preview = questionPreview(question.promptText)
	const previewText = preview.text
		? `${preview.text}${preview.truncated ? '…' : ''}`
		: preview.hasImage
			? 'Изображение'
			: 'Пустой вопрос'

	return (
		<TableRow
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={cn(editHref && 'cursor-pointer', isDragging && 'relative z-10 bg-card shadow-md')}
			{...(editHref ? rowLink(editHref) : {})}
		>
			<TableCell className="hidden w-10 pr-0 pl-3 mob:table-cell">
				<button
					type="button"
					{...(sortable ? { ...attributes, ...listeners } : {})}
					disabled={!sortable}
					aria-label={`Перетащить вопрос ${number}`}
					className="flex cursor-grab rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-muted-foreground"
				>
					<GripVertical className="size-4" aria-hidden="true" />
				</button>
			</TableCell>
			<TableCell className="w-10 pl-3 text-right font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums mob:pl-2">
				{number}
			</TableCell>
			<TableCell className="min-w-0 py-2.5">
				<div className="flex items-start gap-2">
					{editHref ? (
						<Link
							href={editHref}
							className="line-clamp-2 min-w-0 leading-snug [overflow-wrap:anywhere] text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none"
						>
							{previewText}
						</Link>
					) : (
						<p className="line-clamp-2 min-w-0 leading-snug [overflow-wrap:anywhere] text-foreground">{previewText}</p>
					)}
					{preview.hasImage && preview.text ? (
						<span title="С изображением" className="mt-0.5 shrink-0 text-muted-foreground">
							<ImageIcon className="size-3.5" aria-hidden="true" />
							<span className="sr-only">С изображением.</span>
						</span>
					) : null}
				</div>
				<p className="mt-0.5 text-xs text-muted-foreground tab:hidden">
					<span>{typeTitle}</span> · {optionsSummary(question)}
					<span className="mob:hidden"> · {pointsLabel(question.points)}</span>
				</p>
			</TableCell>
			<TableCell className="hidden text-muted-foreground tab:table-cell">
				<span className="flex min-w-0 items-center gap-2" title={optionsSummary(question)}>
					<QuestionTypeIcon template={question.questionUiTemplate} />
					<span className="truncate">{typeTitle}</span>
				</span>
			</TableCell>
			<TableCell className="hidden text-right whitespace-nowrap tabular-nums mob:table-cell">
				{question.points.toLocaleString('ru-RU')}
			</TableCell>
			<TableCell className="pr-3">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							className="size-8 rounded-full"
							aria-label={`Действия с вопросом ${number}`}
						>
							<MoreHorizontal className="size-4" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{editHref ? (
							<DropdownMenuItem asChild>
								<Link href={editHref}>
									<Edit className="size-4" aria-hidden="true" />
									Изменить
								</Link>
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem onSelect={() => onEdit?.()} disabled={!onEdit}>
								<Edit className="size-4" aria-hidden="true" />
								Изменить
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
							<Trash2 className="size-4" aria-hidden="true" />
							Удалить
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</TableRow>
	)
}
