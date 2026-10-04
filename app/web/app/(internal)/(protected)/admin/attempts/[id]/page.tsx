import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
import AttemptReview from '@/components/tests/AttemptReview'
import { absoluteUrl } from '@/lib/http/absoluteUrl'
import { objectAccess, type ObjectAccess } from '@/lib/session/object-access'
import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'

interface AttemptReviewResponse {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
}

type AttemptReviewResult = { access: 'ok'; data: AttemptReviewResponse } | { access: Exclude<ObjectAccess, 'ok'> }

async function fetchAttemptReviewData(attemptId: string): Promise<AttemptReviewResult> {
	try {
		const cookieStorage = await cookies()
		const cookieHeader = cookieStorage.toString()
		const url = await absoluteUrl(`/api/tests/admin/attempts/${attemptId}`)

		const res = await fetch(url, {
			method: 'GET',
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			cache: 'no-store',
		})

		const access = objectAccess(res.status)
		if (access !== 'ok') return { access }

		return { access, data: (await res.json()) as AttemptReviewResponse }
	} catch {
		return { access: 'error' }
	}
}

interface Props {
	params: Promise<{ id: string }>
}

export default async function AttemptReviewPage({ params }: Props) {
	const { id } = await params
	const result = await fetchAttemptReviewData(id)

	if (result.access === 'denied') {
		return (
			<AccessDeniedState
				title="Нет доступа к попытке"
				description="Попытка относится к тесту темы, которая не закреплена за вами. Если доступ нужен, обратитесь к администратору."
				backHref="/admin/attempts"
				backLabel="К попыткам"
			/>
		)
	}

	if (result.access !== 'ok') {
		notFound()
	}

	return <AttemptReview attempt={result.data.attempt} questions={result.data.questions} />
}
