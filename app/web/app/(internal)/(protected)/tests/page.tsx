import TestsPageClient from './TestsPageClient'

export const metadata = { title: 'Тесты' }

export const revalidate = 0

export default function TestsPage() {
	return <TestsPageClient />
}
