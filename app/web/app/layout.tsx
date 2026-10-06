import clsx from 'clsx'
import type { Metadata, Viewport } from 'next'

import AppLayout from '@/components/AppLayout/AppLayout'
import { Toaster } from '@/components/ui/sonner'
import { fontMono, fontSans, fontSerif } from '@/config/fonts'
import '@/styles/globals.css'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const SITE_NAME = 'bio-exam'

export const metadata: Metadata = {
	title: {
		default: SITE_NAME,
		template: `%s - ${SITE_NAME}`,
	},
	description: SITE_NAME,
	robots: 'noindex, nofollow',
}

export const viewport: Viewport = {
	themeColor: [{ media: '(prefers-color-scheme: light)', color: 'white' }],
}

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
			<body
				className={clsx(
					'bg-background font-sans antialiased',
					fontSans.variable,
					fontSerif.variable,
					fontMono.variable
				)}
			>
				<AppLayout>{children}</AppLayout>
				<Toaster />
			</body>
		</html>
	)
}
