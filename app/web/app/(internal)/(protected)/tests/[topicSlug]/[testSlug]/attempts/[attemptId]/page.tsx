import { SetBreadcrumbsLabels } from '@/components/Breadcrumbs/SetBreadcrumbsLabels'
import { StudentAttemptResult } from '@/components/tests/student-attempt/StudentAttemptResult'
import { requireServerData, serverRequest } from '@/lib/session/server'
import { parseStudentAttempt } from '@/lib/tests/student-attempt'

export const metadata = { title: 'Результат попытки' }

interface Props {
	params: Promise<{ topicSlug: string; testSlug: string; attemptId: string }>
}

export default async function StudentAttemptPage({ params }: Props) {
	const { topicSlug, testSlug, attemptId } = await params
	const outcome = await serverRequest(`/api/tests/public/attempts/${encodeURIComponent(attemptId)}`, {
		parse: parseStudentAttempt,
	})
	const data = requireServerData(outcome, `/tests/${topicSlug}/${testSlug}/attempts/${attemptId}`)

	const labels = {
		[`/tests/${data.test.topicSlug}`]: data.test.topicTitle,
		[`/tests/${data.test.topicSlug}/${data.test.slug}`]: data.test.title,
	}

	return (
		<>
			<SetBreadcrumbsLabels labels={labels} />
			<StudentAttemptResult {...data} />
		</>
	)
}
