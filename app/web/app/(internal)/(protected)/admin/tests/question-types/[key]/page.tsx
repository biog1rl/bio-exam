import { Metadata } from 'next'

import QuestionTypeDetailsPageClient from './QuestionTypeDetailsPageClient'

export const metadata: Metadata = { title: 'Тип вопроса' }

interface Props {
	params: Promise<{ key: string }>
}

export default async function QuestionTypeDetailsPage({ params }: Props) {
	const { key } = await params
	return <QuestionTypeDetailsPageClient typeKey={key} />
}
