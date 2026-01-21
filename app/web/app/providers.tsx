'use client'

import * as React from 'react'

import type { ThemeProviderProps } from 'next-themes'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

import { SearchProvider } from '@/components/Search/SearchProvider'

export interface ProvidersProps {
	children: React.ReactNode
	themeProps?: ThemeProviderProps
}

export function Providers({ children, themeProps }: ProvidersProps) {
	return (
		<NextThemesProvider {...themeProps}>
			<SearchProvider>{children}</SearchProvider>
		</NextThemesProvider>
	)
}
