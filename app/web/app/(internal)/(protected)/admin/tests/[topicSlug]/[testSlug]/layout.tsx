import { redirect } from 'next/navigation'

import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
import { buildLoginRedirect } from '@/lib/session/redirect'
import { serverRequest } from '@/lib/session/server'

interface Props {
	children: React.ReactNode
	params: Promise<{ topicSlug: string; testSlug: string }>
}

export default async function AdminTestLayout({ children, params }: Props) {
	const { topicSlug, testSlug } = await params
	const topicSegment = encodeURIComponent(topicSlug)
	const testSegment = encodeURIComponent(testSlug)
	const outcome = await serverRequest(`/api/tests/by-slug/${topicSegment}/${testSegment}?view=summary`, {
		parse: () => null,
	})

	if (outcome.kind === 'unauthorized') {
		redirect(buildLoginRedirect(`/admin/tests/${topicSegment}/${testSegment}`))
	}

	if (outcome.kind === 'denied') {
		return (
			<AccessDeniedState
				title="Нет доступа к тесту"
				description="Тест относится к теме, которая не закреплена за вами. Если доступ нужен, обратитесь к администратору."
				backHref="/admin/tests"
				backLabel="К темам"
			/>
		)
	}

	return <>{children}</>
}
