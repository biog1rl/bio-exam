import { Metadata } from 'next'

import QuestionEditorPageClient from '../QuestionEditorPageClient'

export const metadata: Metadata = { title: 'Редактирование вопроса - bio-exam' }

interface Props {
	params: Promise<{ topicSlug: string; testSlug: string; questionId: string }>
}

export default async function EditQuestionPage({ params }: Props) {
	const { topicSlug, testSlug, questionId } = await params

	return <QuestionEditorPageClient topicSlug={topicSlug} testSlug={testSlug} questionId={questionId} />
}
