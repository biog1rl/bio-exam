'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { CheckSquare, Edit, Eye, GripVertical, List, ListOrdered, Radio, Trash2, Type } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { Question } from '../types'

interface Props {
	question: Question
	index: number
	editHref?: string
	viewHref?: string
	onEdit?: () => void
	onDelete: () => void
}

const typeLabels: Record<string, { label: string; icon: typeof Radio }> = {
	radio: { label: 'Один ответ', icon: Radio },
	checkbox: { label: 'Множественный', icon: CheckSquare },
	matching: { label: 'Сопоставление', icon: List },
	short_answer: { label: 'Краткий ответ', icon: Type },
	sequence: { label: 'Последовательность', icon: ListOrdered },
}

function resolveTemplate(
	question: Question
): 'single_choice' | 'multi_choice' | 'matching' | 'short_text' | 'sequence_digits' | null {
	return question.questionUiTemplate ?? null
}

function getIconByTemplate(template: string): typeof Radio {
	if (template === 'multi_choice') return CheckSquare
	if (template === 'matching') return List
	if (template === 'sequence_digits') return ListOrdered
	if (template === 'short_text') return Type
	return Radio
}

export default function QuestionCard({ question, index, editHref, viewHref, onEdit, onDelete }: Props) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: question.id || `new-${question.order}`,
	})

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	}

	const template = resolveTemplate(question)
	const typeConfig = typeLabels[question.type] || {
		label: question.questionTypeTitle || question.type,
		icon: getIconByTemplate(template ?? 'single_choice'),
	}
	const TypeIcon = getIconByTemplate(template ?? 'single_choice')

	// Get preview text (first 100 chars of prompt)
	const previewText = question.promptText
		.replace(/[#*_`\[\]]/g, '')
		.trim()
		.slice(0, 50)

	// Count options/pairs
	const optionsCount =
		template == null
			? 'тип не настроен'
			: template === 'matching'
				? `${question.matchingPairs?.left.length ?? 0} пар`
				: template === 'short_text' || template === 'sequence_digits'
					? 'без вариантов'
					: `${question.options?.length ?? 0} вариантов`

	return (
		<div
			ref={setNodeRef}
			style={style}
			className="flex items-center gap-3 rounded-3xl border border-border/70 bg-secondary/45 p-unit transition-colors hover:bg-secondary/70"
		>
			<button
				{...attributes}
				{...listeners}
				className="cursor-grab rounded-2xl bg-card p-2 text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
			>
				<GripVertical className="size-5" />
			</button>

			<div className="flex size-10 items-center justify-center rounded-2xl bg-card font-mono text-sm font-medium text-muted-foreground">
				{index + 1}
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="flex items-center gap-1 rounded-full bg-card">
						<TypeIcon className="size-3" />
						{question.questionTypeTitle || typeConfig.label}
					</Badge>
					<span className="text-xs text-muted-foreground">
						{optionsCount} • {question.points} б.
					</span>
				</div>
				<p className="mt-1 truncate text-sm text-muted-foreground">
					{previewText || 'Пустой вопрос'}
					{question.promptText.length > 100 && '...'}
				</p>
			</div>

			<div className="flex items-center gap-1">
				{editHref ? (
					<>
						<Button size="sm" variant="ghost" asChild className="rounded-full">
							<Link href={editHref} title="Редактировать вопрос">
								<Edit className="size-4" />
							</Link>
						</Button>
						{viewHref ? (
							<Button size="sm" variant="ghost" asChild className="rounded-full">
								<Link href={viewHref} title="Открыть вопрос в тесте">
									<Eye className="size-4" />
								</Link>
							</Button>
						) : null}
					</>
				) : (
					<Button size="sm" variant="ghost" onClick={onEdit} disabled={!onEdit} className="rounded-full">
						<Edit className="size-4" />
					</Button>
				)}
				<Button size="sm" variant="ghost" onClick={onDelete} className="rounded-full">
					<Trash2 className="size-4 text-destructive" />
				</Button>
			</div>
		</div>
	)
}
