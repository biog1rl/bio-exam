import { Metadata } from 'next'

import QuestionEditorPageClient from '../QuestionEditorPageClient'

export const metadata: Metadata = { title: 'Новый вопрос - bio-exam' }

interface Props {
	params: Promise<{ topicSlug: string; testSlug: string }>
}

export default async function NewQuestionPage({ params }: Props) {
	const { topicSlug, testSlug } = await params

	return <QuestionEditorPageClient topicSlug={topicSlug} testSlug={testSlug} />
}
