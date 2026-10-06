import { Suspense } from 'react'

import { Loader2 } from 'lucide-react'

import LoginPage from './LoginPageClient'

export default function Page() {
	return (
		<Suspense fallback={<Loader2 className="size-5 animate-spin" aria-hidden="true" />}>
			<LoginPage />
		</Suspense>
	)
}
