'use client'

import { useEffect } from 'react'

import type { ThemeProviderProps } from 'next-themes'
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'

import { SearchProvider } from '@/components/Search/SearchProvider'
import { AuthProvider } from '@/components/providers/AuthProvider'

export interface ProvidersProps {
	children: React.ReactNode
	themeProps?: ThemeProviderProps
}

export function Providers({ children, themeProps }: ProvidersProps) {
	const { setTheme } = useTheme()

	useEffect(() => {
		// При заходе на сайт всегда ставим светлую тему
		setTheme('light')
	}, [setTheme])

	return (
		<NextThemesProvider defaultTheme="light" enableSystem={false} {...themeProps}>
			<AuthProvider>
				<SearchProvider>{children}</SearchProvider>
			</AuthProvider>
		</NextThemesProvider>
	)
}
