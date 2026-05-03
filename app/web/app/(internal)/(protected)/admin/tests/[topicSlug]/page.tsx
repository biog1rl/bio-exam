import { Metadata } from 'next'

import TopicTestsClient from './TopicTestsClient'

export const metadata: Metadata = { title: 'Тема тестов - bio-exam' }

interface Props {
	params: Promise<{ topicSlug: string }>
}

export default async function TopicTestsPage({ params }: Props) {
	const { topicSlug } = await params
	return <TopicTestsClient topicSlug={topicSlug} />
}
