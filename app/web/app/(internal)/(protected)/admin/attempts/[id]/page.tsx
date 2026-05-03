import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import AttemptReview from '@/components/tests/AttemptReview'
import { absoluteUrl } from '@/lib/http/absoluteUrl'
import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'

interface AttemptReviewResponse {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
}

async function fetchAttemptReviewData(attemptId: string): Promise<AttemptReviewResponse | null> {
	try {
		const cookieStorage = await cookies()
		const cookieHeader = cookieStorage.toString()
		const url = await absoluteUrl(`/api/tests/admin/attempts/${attemptId}`)

		const res = await fetch(url, {
			method: 'GET',
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			cache: 'no-store',
		})

		if (res.status === 404) return null
		if (!res.ok) return null

		return (await res.json()) as AttemptReviewResponse
	} catch {
		return null
	}
}

interface Props {
	params: Promise<{ id: string }>
}

export default async function AttemptReviewPage({ params }: Props) {
	const { id } = await params
	const data = await fetchAttemptReviewData(id)

	if (!data) {
		notFound()
	}

	return <AttemptReview attempt={data.attempt} questions={data.questions} />
}
