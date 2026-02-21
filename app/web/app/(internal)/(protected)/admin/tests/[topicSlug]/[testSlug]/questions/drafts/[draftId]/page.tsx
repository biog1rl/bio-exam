import { Metadata } from 'next'

import QuestionEditorPageClient from '../../QuestionEditorPageClient'

export const metadata: Metadata = { title: 'Черновик вопроса - bio-exam' }

interface Props {
	params: Promise<{ topicSlug: string; testSlug: string; draftId: string }>
}

export default async function QuestionDraftPage({ params }: Props) {
	const { topicSlug, testSlug, draftId } = await params

	return <QuestionEditorPageClient topicSlug={topicSlug} testSlug={testSlug} questionDraftId={draftId} />
}
