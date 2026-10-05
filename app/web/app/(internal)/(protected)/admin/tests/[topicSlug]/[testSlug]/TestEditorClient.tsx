'use client'

import { useState } from 'react'

import { Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { ColumnFilterMenu } from '@/components/table/ColumnFilterMenu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { TopicFormDialog } from '../../components/TopicFormDialog'
import { QuestionsPanel, QuestionsToolbar } from '../../components/test-editor/QuestionsPanel'
import { StudentAccessPanel, StudentAccessToolbar } from '../../components/test-editor/StudentAccessPanel'
import { TestEditorHeader } from '../../components/test-editor/TestEditorHeader'
import { TestEditorSaveBar } from '../../components/test-editor/TestEditorSaveBar'
import { TestSettingsSheet } from '../../components/test-editor/TestSettingsSheet'
import { resolveQuestionDraftLabel } from '../../components/test-editor/test-editor-utils'
import {
	ACCESS_STATUSES,
	DEFAULT_SORT,
	accessStatusCounts,
	accessUserStatus,
	editorTabSearch,
	parseEditorTab,
	type AccessStatus,
	type EditorTab,
	type QuestionSort,
} from '../../components/test-editor/test-editor-view'
import { useTestEditorModel } from '../../components/test-editor/useTestEditorModel'

interface Props {
	topicSlug?: string
	testSlug?: string
}

const TAB_TRIGGER_CLASS =
	'rounded-full px-4 text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm'

export default function TestEditorClient({ topicSlug, testSlug }: Props) {
	const model = useTestEditorModel({ topicSlug, testSlug })
	const searchParams = useSearchParams()
	const [questionQuery, setQuestionQuery] = useState('')
	const [questionSort, setQuestionSort] = useState<QuestionSort>(DEFAULT_SORT)
	const [studentQuery, setStudentQuery] = useState('')
	const [studentStatuses, setStudentStatuses] = useState<AccessStatus[]>(['active'])
	const hasAccessTab = model.isEditingExisting && Boolean(model.testId)
	const tab = hasAccessTab ? parseEditorTab(searchParams?.get('tab'), model.isCreateMode) : 'questions'

	const changeTab = (value: string) => {
		const next = parseEditorTab(value, model.isCreateMode)
		window.history.replaceState(null, '', `${window.location.pathname}${editorTabSearch(next)}`)
	}

	if (model.testError) {
		return (
			<LoadErrorAlert title="Не удалось загрузить настройки теста" error={model.testError} onRetry={model.retryTest} />
		)
	}

	if (model.isLoading) {
		return (
			<div className="flex items-center justify-center rounded-4xl border border-border/80 bg-card/90 p-12 shadow-sm">
				<Loader2 className="size-8 animate-spin text-primary" />
			</div>
		)
	}

	const accessCounts = accessStatusCounts(model.studentAccessPanelProps.studentAssignments)
	const studentStatusFilter = (
		<ColumnFilterMenu
			label="Фильтр по статусу"
			options={ACCESS_STATUSES.map((value) => ({
				value,
				label: value === 'active' ? 'Активен' : 'Неактивен',
				count: accessCounts[value],
			}))}
			selected={studentStatuses}
			onChange={setStudentStatuses}
		/>
	)

	const tabs: { value: EditorTab; label: string }[] = [
		{ value: 'questions', label: `Вопросы · ${model.headerProps.questionCount}` },
		...(hasAccessTab ? [{ value: 'access' as const, label: `Доступ учеников · ${model.assignedCount}` }] : []),
	]

	return (
		<div className="space-y-5">
			<SetBreadcrumbsLabels labels={model.breadcrumbLabels} />
			<TestEditorHeader {...model.headerProps} />

			<Tabs value={tab} onValueChange={changeTab} className="gap-4">
				<div className="flex flex-col gap-3 tab-sm:flex-row tab-sm:items-center tab-sm:justify-between">
					<TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-full bg-secondary/60 p-1 mob:w-fit">
						{tabs.map((item) => (
							<TabsTrigger key={item.value} value={item.value} className={TAB_TRIGGER_CLASS}>
								{item.label}
							</TabsTrigger>
						))}
					</TabsList>
					{tab === 'questions' ? (
						<QuestionsToolbar
							query={questionQuery}
							onQueryChange={setQuestionQuery}
							creatingQuestionDraft={model.questionsPanelProps.creatingQuestionDraft}
							onAddQuestion={model.questionsPanelProps.onAddQuestion}
						/>
					) : (
						<StudentAccessToolbar
							{...model.studentAccessToolbarProps}
							query={studentQuery}
							onQueryChange={setStudentQuery}
							statusFilter={studentStatusFilter}
						/>
					)}
				</div>

				<TabsContent value="questions">
					{model.questionsError ? (
						<LoadErrorAlert
							title="Не удалось загрузить вопросы"
							error={model.questionsError}
							onRetry={model.retryQuestions}
						/>
					) : model.questionsLoading ? (
						<Skeleton className="h-96 rounded-4xl" aria-label="Загрузка вопросов" />
					) : (
						<QuestionsPanel
							{...model.questionsPanelProps}
							query={questionQuery}
							onResetQuery={() => setQuestionQuery('')}
							sort={questionSort}
							onSortChange={setQuestionSort}
							getQuestionDraftLabel={resolveQuestionDraftLabel}
						/>
					)}
				</TabsContent>

				{hasAccessTab ? (
					<TabsContent value="access">
						<StudentAccessPanel
							{...model.studentAccessPanelProps}
							query={studentQuery}
							status={accessUserStatus(studentStatuses)}
							statusFilter={studentStatusFilter}
							onResetFilters={() => {
								setStudentQuery('')
								setStudentStatuses([])
							}}
						/>
					</TabsContent>
				) : null}
			</Tabs>

			<TestEditorSaveBar {...model.saveBarProps} />
			<TestSettingsSheet {...model.settingsSheetProps} />

			<TopicFormDialog {...model.topicDialogProps} />
			{model.alertDialog}
		</div>
	)
}
