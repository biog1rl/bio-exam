import { Metadata } from 'next'

import TestsClient from './TestsClient'

export const metadata: Metadata = { title: 'Тесты' }

export default function TestsPage() {
	return <TestsClient />
}
