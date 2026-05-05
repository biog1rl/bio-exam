'use client'

import { Loader2 } from 'lucide-react'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'

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

	if (model.isLoading) {
		return (
			<div className="rounded-4xl border-border/80 bg-card/90 flex items-center justify-center border p-12 shadow-sm">
				<Loader2 className="text-primary size-8 animate-spin" />
			</div>
		)
	}

	return (
		<div className="space-y-5">
			<SetBreadcrumbsLabels labels={model.breadcrumbLabels} />
			<TestEditorHeader {...model.headerProps} />

			<div className="grid gap-5 xl:grid-cols-[23.75rem_1fr]">
				<TestSettingsPanel {...model.settingsPanelProps} />
				<QuestionsPanel {...model.questionsPanelProps} getQuestionDraftLabel={resolveQuestionDraftLabel} />
			</div>

			{model.isEditingExisting && model.testId ? <StudentAccessPanel {...model.studentAccessPanelProps} /> : null}

			<TopicFormDialog {...model.topicDialogProps} />
			{model.alertDialog}
		</div>
	)
}
