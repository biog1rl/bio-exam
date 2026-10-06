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

import { useMemo } from 'react'

import { Loader2, Plus, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { SortableHead } from '@/components/table/SortableHead'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime } from '@/lib/utils/dates'
import { sortDirectionOf } from '@/lib/utils/table-sort'

import type { Question, QuestionDraft } from '../../types'
import { AdminTestsSectionCard } from '../AdminTestsSectionCard'
import { QuestionRow, questionRowId } from './QuestionRow'
import {
	filterQuestions,
	manualOrderAllowed,
	nextSort,
	sortEntries,
	type QuestionSort,
	type QuestionSortKey,
} from './test-editor-view'

interface QuestionsToolbarProps {
	query: string
	onQueryChange: (query: string) => void
	creatingQuestionDraft: boolean
	onAddQuestion: () => void
}

export function QuestionsToolbar({
	query,
	onQueryChange,
	creatingQuestionDraft,
	onAddQuestion,
}: QuestionsToolbarProps) {
	return (
		<div className="flex min-w-0 items-center gap-2 tab-sm:w-80">
			<label className="relative block min-w-0 flex-1">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					placeholder="Текст или номер вопроса"
					aria-label="Поиск вопросов"
					className="h-10 rounded-full bg-card pl-9"
				/>
			</label>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						className="size-10 shrink-0 rounded-full"
						onClick={onAddQuestion}
						disabled={creatingQuestionDraft}
						aria-label="Добавить вопрос"
					>
						{creatingQuestionDraft ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<Plus className="size-4" aria-hidden="true" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>Добавить вопрос</TooltipContent>
			</Tooltip>
		</div>
	)
}

interface SortHeadProps {
	label: string
	column: QuestionSortKey
	sort: QuestionSort
	onSortChange: (sort: QuestionSort) => void
	className?: string
	align?: 'left' | 'right'
}

function SortHead({ label, column, sort, onSortChange, className, align }: SortHeadProps) {
	return (
		<SortableHead
			label={label}
			direction={sortDirectionOf(sort, column)}
			onSort={() => onSortChange(nextSort(sort, column))}
			align={align}
			className={className}
		/>
	)
}

interface QuestionsPanelProps {
	questions: Question[]
	questionDrafts: QuestionDraft[]
	topicSlug?: string
	testSlug?: string
	query: string
	onResetQuery: () => void
	sort: QuestionSort
	onSortChange: (sort: QuestionSort) => void
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
	query,
	onResetQuery,
	sort,
	onSortChange,
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

	const entries = useMemo(() => sortEntries(filterQuestions(questions, query), sort), [questions, query, sort])
	const searching = query.trim() !== ''
	const manualOrder = manualOrderAllowed(sort, query)

	return (
		<div className="space-y-5">
			{questionDrafts.length > 0 ? (
				<AdminTestsSectionCard title="Черновики вопросов" headerClassName="pb-3">
					{questionDrafts.map((draft) => (
						<div
							key={draft.id}
							className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-secondary/55 px-3 py-2"
						>
							<Link
								className="min-w-0 flex-1 truncate text-sm hover:underline"
								href={`/admin/tests/${topicSlug}/${testSlug}/questions/drafts/${draft.id}`}
							>
								{getQuestionDraftLabel(draft)}
							</Link>
							<div className="text-xs text-muted-foreground">{formatDateTime(draft.updatedAt)}</div>
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

			{questions.length === 0 ? (
				<div className="flex flex-col items-center gap-4 rounded-4xl border border-dashed border-border bg-card/70 px-6 py-14 text-center">
					<p className="text-muted-foreground">В тесте пока нет вопросов.</p>
					<Button className="rounded-full" onClick={onAddQuestion} disabled={creatingQuestionDraft}>
						{creatingQuestionDraft ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<Plus className="size-4" aria-hidden="true" />
						)}
						Добавить первый вопрос
					</Button>
				</div>
			) : entries.length === 0 ? (
				<div className="flex flex-col items-center gap-4 rounded-4xl border border-dashed border-border bg-card/70 px-6 py-14 text-center">
					<p className="text-muted-foreground">По запросу «{query.trim()}» ничего не найдено.</p>
					<Button variant="outline" className="rounded-full" onClick={onResetQuery}>
						Сбросить поиск
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					<div className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-sm">
						<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
							<SortableContext
								items={entries.map((entry) => questionRowId(entry.question))}
								strategy={verticalListSortingStrategy}
								disabled={!manualOrder}
							>
								<Table className="table-fixed">
									<TableHeader>
										<TableRow className="hover:bg-transparent">
											<TableHead className="hidden w-10 pl-3 mob:table-cell">
												<span className="sr-only">Порядок</span>
											</TableHead>
											<SortHead
												label="№"
												column="order"
												sort={sort}
												onSortChange={onSortChange}
												align="right"
												className="w-16 pl-3 mob:pl-2"
											/>
											<SortHead label="Вопрос" column="text" sort={sort} onSortChange={onSortChange} />
											<SortHead
												label="Тип"
												column="type"
												sort={sort}
												onSortChange={onSortChange}
												className="hidden w-56 tab:table-cell"
											/>
											<SortHead
												label="Баллы"
												column="points"
												sort={sort}
												onSortChange={onSortChange}
												align="right"
												className="hidden w-24 mob:table-cell"
											/>
											<TableHead className="w-14 pr-3">
												<span className="sr-only">Действия</span>
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{entries.map(({ question, index }) => (
											<QuestionRow
												key={questionRowId(question)}
												question={question}
												index={index}
												sortable={manualOrder}
												editHref={
													question.id && topicSlug && testSlug
														? `/admin/tests/${topicSlug}/${testSlug}/questions/${question.id}`
														: undefined
												}
												onEdit={() => onEditQuestion(index)}
												onDelete={() => onDeleteQuestion(index)}
											/>
										))}
									</TableBody>
								</Table>
							</SortableContext>
						</DndContext>
					</div>
					<p className="px-3 text-xs text-muted-foreground" aria-live="polite">
						{[
							searching ? `Показано ${entries.length} из ${questions.length}` : null,
							manualOrder ? null : 'Перетаскивать вопросы можно, когда сортировка сброшена и поиск пуст',
						]
							.filter(Boolean)
							.join(' · ')}
					</p>
				</div>
			)}
		</div>
	)
}
