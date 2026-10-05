import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
import AttemptReview from '@/components/tests/AttemptReview'
import { requireServerData, serverRequest } from '@/lib/session/server'
import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'

interface AttemptReviewResponse {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
}

function parseAttemptReview(body: unknown): AttemptReviewResponse {
	if (!body || typeof body !== 'object') throw new Error('Malformed attempt review response')
	const record = body as Record<string, unknown>
	if (!record.attempt || typeof record.attempt !== 'object' || !Array.isArray(record.questions)) {
		throw new Error('Malformed attempt review response')
	}
	return body as AttemptReviewResponse
}

interface Props {
	params: Promise<{ id: string }>
}

export default async function AttemptReviewPage({ params }: Props) {
	const { id } = await params
	const outcome = await serverRequest(`/api/tests/admin/attempts/${encodeURIComponent(id)}`, {
		parse: parseAttemptReview,
	})

	if (outcome.kind === 'denied') {
		return (
			<AccessDeniedState
				title="Нет доступа к попытке"
				description="Попытка относится к тесту темы, которая не закреплена за вами. Если доступ нужен, обратитесь к администратору."
				backHref="/admin/attempts"
				backLabel="К попыткам"
			/>
		)
	}

	const data = requireServerData(outcome, `/admin/attempts/${encodeURIComponent(id)}`)

	return <AttemptReview attempt={data.attempt} questions={data.questions} />
}
