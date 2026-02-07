'use client'

import useSWR from 'swr'

import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import TestRunner from '@/components/tests/TestRunner'
import { fetchMyTestAttempts, fetchPublicTestBySlug } from '@/lib/tests/api'

type Props = {
	topicSlug: string
	testSlug: string
}

export default function TestPageClient({ topicSlug, testSlug }: Props) {
	const detailKey = `${topicSlug}/${testSlug}`
	const {
		data: testData,
		isLoading: loadingTest,
		error: testError,
	} = useSWR(detailKey, () => fetchPublicTestBySlug(topicSlug, testSlug))

	const testId = testData?.test?.id
	const { data: attemptsData } = useSWR(testId ? `${testId}-attempts` : null, () => fetchMyTestAttempts(testId!))

	if (loadingTest) {
		return <div className="p-6">Загрузка теста...</div>
	}

	if (testError || !testData?.test) {
		return <div className="p-6">Тест не найден</div>
	}

	const labels = {
		[`/tests/${topicSlug}`]: testData.test.topicTitle,
		[`/tests/${topicSlug}/${testSlug}`]: testData.test.title,
	}

	return (
		<>
			<SetBreadcrumbsLabels labels={labels} />
			<TestRunner test={testData.test} questions={testData.questions} initialAttempts={attemptsData?.attempts ?? []} />
		</>
	)
}
