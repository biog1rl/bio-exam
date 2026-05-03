import TestPageClient from './TestPageClient'

interface Props {
	params: Promise<{ topicSlug: string; testSlug: string }>
}

export default async function TestPage({ params }: Props) {
	const { topicSlug, testSlug } = await params
	return <TestPageClient topicSlug={topicSlug} testSlug={testSlug} />
}
