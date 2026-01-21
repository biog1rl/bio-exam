import clsx from 'clsx'
import type { Metadata, Viewport } from 'next'

import { Toaster } from '@/components/ui/sonner'
import { fontSans } from '@/config/fonts'
import { siteConfig } from '@/config/site'
import '@/styles/globals.css'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
	title: {
		default: siteConfig.name,
		template: `%s - ${siteConfig.name}`,
	},
	description: siteConfig.description,
	icons: { icon: '/favicon.svg' },
	robots: 'noindex, nofollow',
}

export const viewport: Viewport = {
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: 'white' },
		{ media: '(prefers-color-scheme: dark)', color: 'black' },
	],
}

// ---------------- layout ----------------

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html suppressHydrationWarning data-scroll-behavior="smooth" lang="ru" style={{ overflow: 'hidden' }}>
			<body className={clsx('font-sans antialiased', fontSans.variable)}>
				{children}
				<Toaster />
			</body>
		</html>
	)
}
