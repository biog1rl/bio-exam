'use client'

import { PageErrorState } from '@/components/feedback/PageErrorState'

type ErrorPageProps = {
	error: Error & { digest?: string }
	reset: () => void
	retry: () => void
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
	return <PageErrorState digest={error.digest} onRetry={retry} />
}
