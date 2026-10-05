'use client'

import { Loader2 } from 'lucide-react'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { LoadErrorAlert } from '@/components/feedback/LoadErrorAlert'
import { Skeleton } from '@/components/ui/skeleton'

import { TopicFormDialog } from '../../components/TopicFormDialog'
import { QuestionsPanel } from '../../components/test-editor/QuestionsPanel'
import { StudentAccessPanel } from '../../components/test-editor/StudentAccessPanel'
import { TestEditorHeader } from '../../components/test-editor/TestEditorHeader'
import { TestSettingsPanel } from '../../components/test-editor/TestSettingsPanel'
import { resolveQuestionDraftLabel } from '../../components/test-editor/test-editor-utils'
import { useTestEditorModel } from '../../components/test-editor/useTestEditorModel'

interface Props {
	topicSlug?: string
	testSlug?: string
}

export default function TestEditorClient({ topicSlug, testSlug }: Props) {
	const model = useTestEditorModel({ topicSlug, testSlug })

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

	return (
		<div className="space-y-5">
			<SetBreadcrumbsLabels labels={model.breadcrumbLabels} />
			<TestEditorHeader {...model.headerProps} />

			<div className="grid gap-5 xl:grid-cols-[23.75rem_1fr]">
				<TestSettingsPanel {...model.settingsPanelProps} />
				{model.questionsError ? (
					<LoadErrorAlert
						title="Не удалось загрузить вопросы"
						error={model.questionsError}
						onRetry={model.retryQuestions}
					/>
				) : model.questionsLoading ? (
					<Skeleton className="h-96 rounded-4xl" aria-label="Загрузка вопросов" />
				) : (
					<QuestionsPanel {...model.questionsPanelProps} getQuestionDraftLabel={resolveQuestionDraftLabel} />
				)}
			</div>

			{model.isEditingExisting && model.testId ? <StudentAccessPanel {...model.studentAccessPanelProps} /> : null}

			<TopicFormDialog {...model.topicDialogProps} />
			{model.alertDialog}
		</div>
	)
}
