import { cookies } from 'next/headers'

import { AccessDeniedState } from '@/components/auth/AccessDeniedState'
import { absoluteUrl } from '@/lib/http/absoluteUrl'
import { objectAccess, type ObjectAccess } from '@/lib/session/object-access'

async function fetchTestAccess(topicSlug: string, testSlug: string): Promise<ObjectAccess> {
	try {
		const cookieStorage = await cookies()
		const cookieHeader = cookieStorage.toString()
		const url = await absoluteUrl(
			`/api/tests/by-slug/${encodeURIComponent(topicSlug)}/${encodeURIComponent(testSlug)}?view=summary`
		)

		const res = await fetch(url, {
			method: 'GET',
			headers: cookieHeader ? { cookie: cookieHeader } : undefined,
			cache: 'no-store',
		})

		return objectAccess(res.status)
	} catch {
		return 'error'
	}
}

interface Props {
	children: React.ReactNode
	params: Promise<{ topicSlug: string; testSlug: string }>
}

export default async function AdminTestLayout({ children, params }: Props) {
	const { topicSlug, testSlug } = await params
	const access = await fetchTestAccess(topicSlug, testSlug)

	if (access === 'denied') {
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
