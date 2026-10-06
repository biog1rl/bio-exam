'use client'

import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { SearchProvider } from '@/components/Search/SearchProvider'

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<NuqsAdapter>
			<SearchProvider>{children}</SearchProvider>
		</NuqsAdapter>
	)
}
