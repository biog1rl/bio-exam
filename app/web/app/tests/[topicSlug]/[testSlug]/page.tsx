import { TestLandingPageClient } from './TestLandingPageClient'

interface Props {
	params: Promise<{ topicSlug: string; testSlug: string }>
}

export default async function TestLandingPage({ params }: Props) {
	const { topicSlug, testSlug } = await params
	return <TestLandingPageClient topicSlug={topicSlug} testSlug={testSlug} />
}
