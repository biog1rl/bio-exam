import { Metadata } from 'next'

import TestEditorClient from '../[topicSlug]/[testSlug]/TestEditorClient'

export const metadata: Metadata = { title: 'Новый тест' }

export default function NewTestPage() {
	return <TestEditorClient />
}
