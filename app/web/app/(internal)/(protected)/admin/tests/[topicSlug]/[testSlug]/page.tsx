import { Metadata } from 'next'

import TestEditorClient from './TestEditorClient'

export const metadata: Metadata = { title: 'Редактор теста - bio-exam' }

interface Props {
	params: Promise<{ topicSlug: string; testSlug: string }>
}

export default async function EditTestPage({ params }: Props) {
	const { topicSlug, testSlug } = await params
	return <TestEditorClient topicSlug={topicSlug} testSlug={testSlug} />
}
