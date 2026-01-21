import { Suspense } from 'react'

import LoaderComponent from '@/components/LoaderComponent'

import LoginPage from './LoginPageClient'

export default function Page() {
	return (
		<Suspense fallback={<LoaderComponent />}>
			<LoginPage />
		</Suspense>
	)
}
