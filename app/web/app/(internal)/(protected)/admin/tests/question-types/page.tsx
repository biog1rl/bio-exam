import { Metadata } from 'next'

import QuestionTypesPageClient from './QuestionTypesPageClient'

export const metadata: Metadata = { title: 'Типы вопросов' }

export default function QuestionTypesPage() {
	return <QuestionTypesPageClient />
}
