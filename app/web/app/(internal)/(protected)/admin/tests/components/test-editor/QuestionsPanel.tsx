import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { Loader2, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

import type { Question, QuestionDraft } from '../../types'
import { AdminTestsSectionCard } from '../AdminTestsSectionCard'
import QuestionCard from '../QuestionCard'

interface QuestionsPanelProps {
	questions: Question[]
	questionDrafts: QuestionDraft[]
	topicSlug?: string
	testSlug?: string
	creatingQuestionDraft: boolean
	onAddQuestion: () => void
	onDeleteQuestionDraft: (draft: QuestionDraft) => void | Promise<void>
	onEditQuestion: (index: number) => void
	onDeleteQuestion: (index: number) => void | Promise<void>
	onDragEnd: (event: DragEndEvent) => void | Promise<void>
	getQuestionDraftLabel: (draft: QuestionDraft) => string
}

export function QuestionsPanel({
	questions,
	questionDrafts,
	topicSlug,
	testSlug,
	creatingQuestionDraft,
	onAddQuestion,
	onDeleteQuestionDraft,
	onEditQuestion,
	onDeleteQuestion,
	onDragEnd,
	getQuestionDraftLabel,
}: QuestionsPanelProps) {
	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	)

	return (
		<div className="space-y-5">
			{questionDrafts.length > 0 ? (
				<AdminTestsSectionCard title="Черновики вопросов" headerClassName="pb-3">
					{questionDrafts.map((draft) => (
						<div
							key={draft.id}
							className="border-border/70 bg-secondary/55 flex items-center justify-between gap-2 rounded-2xl border px-3 py-2"
						>
							<Link
								className="min-w-0 flex-1 truncate text-sm hover:underline"
								href={`/admin/tests/${topicSlug}/${testSlug}/questions/drafts/${draft.id}`}
							>
								{getQuestionDraftLabel(draft)}
							</Link>
							<div className="text-muted-foreground text-xs">{new Date(draft.updatedAt).toLocaleString('ru-RU')}</div>
							<Button
								size="icon"
								variant="ghost"
								aria-label="Удалить черновик вопроса"
								onClick={() => onDeleteQuestionDraft(draft)}
							>
								<Trash2 className="size-4" />
							</Button>
						</div>
					))}
				</AdminTestsSectionCard>
			) : null}

			<AdminTestsSectionCard
				title="Вопросы"
				headerClassName="pb-3"
				actions={
					<Button onClick={onAddQuestion} disabled={creatingQuestionDraft} className="rounded-full">
						{creatingQuestionDraft ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<Plus className="mr-2 size-4" />
						)}
						Добавить вопрос
					</Button>
				}
			>
				{questions.length === 0 ? (
					<div className="text-muted-foreground py-12 text-center">
						Нет вопросов. Нажмите &quot;Добавить вопрос&quot; чтобы начать.
					</div>
				) : (
					<ScrollArea className="rounded-xl">
						<div className="tab:max-h-[calc(100dvh-22rem)] pr-3">
							<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
								<SortableContext
									items={questions.map((q) => q.id || `new-${q.order}`)}
									strategy={verticalListSortingStrategy}
								>
									<div className="space-y-2">
										{questions.map((question, index) => (
											<QuestionCard
												key={question.id || `new-${question.order}`}
												question={question}
												index={index}
												editHref={
													question.id && topicSlug && testSlug
														? `/admin/tests/${topicSlug}/${testSlug}/questions/${question.id}`
														: undefined
												}
												viewHref={
													question.id && topicSlug && testSlug
														? `/tests/${topicSlug}/${testSlug}#question-${question.id}`
														: undefined
												}
												onEdit={() => onEditQuestion(index)}
												onDelete={() => onDeleteQuestion(index)}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>
						</div>
					</ScrollArea>
				)}
			</AdminTestsSectionCard>
		</div>
	)
}
