'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { CheckSquare, Edit, Eye, GripVertical, List, Radio, Trash2 } from 'lucide-react'
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
	checkbox: { label: 'Несколько', icon: CheckSquare },
	matching: { label: 'Сопоставление', icon: List },
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

	const typeConfig = typeLabels[question.type] || typeLabels.radio
	const TypeIcon = typeConfig.icon

	// Get preview text (first 100 chars of prompt)
	const previewText = question.promptText
		.replace(/[#*_`\[\]]/g, '')
		.trim()
		.slice(0, 50)

	// Count options/pairs
	const optionsCount =
		question.type === 'matching' ? (question.matchingPairs?.left.length ?? 0) : (question.options?.length ?? 0)

	return (
		<div
			ref={setNodeRef}
			style={style}
			className="bg-card hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-3"
		>
			<button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
				<GripVertical className="text-muted-foreground h-5 w-5" />
			</button>

			<div className="bg-muted text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium">
				{index + 1}
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<Badge variant="outline" className="flex items-center gap-1">
						<TypeIcon className="h-3 w-3" />
						{typeConfig.label}
					</Badge>
					<span className="text-muted-foreground text-xs">
						{optionsCount} {question.type === 'matching' ? 'пар' : 'вариантов'} • {question.points} б.
					</span>
				</div>
				<p className="text-muted-foreground mt-1 truncate text-sm">
					{previewText || 'Пустой вопрос'}
					{question.promptText.length > 100 && '...'}
				</p>
			</div>

			<div className="flex items-center gap-1">
				{editHref ? (
					<>
						<Button size="sm" variant="ghost" asChild>
							<Link href={editHref} title="Редактировать вопрос">
								<Edit className="h-4 w-4" />
							</Link>
						</Button>
						{viewHref ? (
							<Button size="sm" variant="ghost" asChild>
								<Link href={viewHref} title="Открыть вопрос в тесте">
									<Eye className="h-4 w-4" />
								</Link>
							</Button>
						) : null}
					</>
				) : (
					<Button size="sm" variant="ghost" onClick={onEdit} disabled={!onEdit}>
						<Edit className="h-4 w-4" />
					</Button>
				)}
				<Button size="sm" variant="ghost" onClick={onDelete}>
					<Trash2 className="text-destructive h-4 w-4" />
				</Button>
			</div>
		</div>
	)
}
