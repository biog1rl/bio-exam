'use client'

import { SearchProvider } from '@/components/Search/SearchProvider'

export function Providers({ children }: { children: React.ReactNode }) {
	return <SearchProvider>{children}</SearchProvider>
}
