import clsx from 'clsx'
import type { Metadata, Viewport } from 'next'

import AppLayout from '@/components/AppLayout/AppLayout'
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
	themeColor: [{ media: '(prefers-color-scheme: light)', color: 'white' }],
}

// ---------------- layout ----------------

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html
			suppressHydrationWarning
			data-scroll-behavior="smooth"
			lang="ru"
			data-theme="light"
			style={{ overflow: 'hidden' }}
		>
			<body className={clsx('bg-white font-sans antialiased', fontSans.variable)}>
				<AppLayout>{children}</AppLayout>
				<Toaster />
			</body>
		</html>
	)
}
