import { Metadata } from 'next'

import { BankExplorer } from '../components/bank/BankExplorer'

export const metadata: Metadata = { title: 'Тема тестов' }

interface Props {
	params: Promise<{ topicSlug: string }>
}

export default async function TopicTestsPage({ params }: Props) {
	const { topicSlug } = await params
	return <BankExplorer topicSlug={topicSlug} />
}
