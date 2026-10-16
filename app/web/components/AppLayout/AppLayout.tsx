import { headers } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'

import { Providers } from '@/app/providers'
import { MainScrollArea } from '@/components/AppLayout/MainScrollArea'
import { AppSidebar } from '@/components/AppSidebar'
import Breadcrumbs from '@/components/Breadcrumbs'
import { BreadcrumbsProvider } from '@/components/Breadcrumbs/BreadcrumbsContext'
import BackButton from '@/components/Buttons/BackButton'
import { MobileMenuButton } from '@/components/MobileMenuButton'
import SearchButton from '@/components/Search/SearchButton'
import SearchDialog from '@/components/Search/SearchDialog'
import AuthGuard from '@/components/auth/AuthGuard'
import NotificationBell from '@/components/notifications/NotificationBell'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ANONYMOUS_PAGE_HEADER } from '@/lib/navigation/public-paths'
import { SESSION_REFRESH_HEADER, SESSION_REFRESH_UNAVAILABLE } from '@/lib/session/proxy-refresh'
import { getServerMe, type ServerMe } from '@/lib/session/server'

export default async function AppLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	const requestHeaders = await headers()
	if (requestHeaders.has(ANONYMOUS_PAGE_HEADER)) return <>{children}</>

	let me: ServerMe | null = null
	let sessionError = false
	try {
		me = await getServerMe()
	} catch (error) {
		unstable_rethrow(error)
		sessionError = true
	}
	if (!me && requestHeaders.get(SESSION_REFRESH_HEADER) === SESSION_REFRESH_UNAVAILABLE) {
		sessionError = true
	}

	return (
		<>
			<Providers>
				{/* RBAC-провайдер с SSR-инициализацией */}
				<AuthProvider initialMe={me} sessionError={sessionError}>
					<BreadcrumbsProvider>
						<SidebarProvider className="items-center justify-center bg-background">
							<AuthGuard hideOnPublicPath>
								<AppSidebar />
							</AuthGuard>

							<SidebarInset className="h-screen min-w-0 overflow-hidden bg-background">
								<AuthGuard hideOnPublicPath>
									<header className="sticky top-0 z-10 flex min-w-0 items-center border-b border-border bg-background/90 p-unit-mob backdrop-blur-xl tab-sm:p-unit">
										<div className="flex h-full shrink-0 items-center gap-2 tab-sm:gap-4">
											<MobileMenuButton />
											<BackButton />
											<Separator className="hidden bg-border mob:block" orientation="vertical" />
										</div>

										<div className="ml-unit-mob flex min-w-0 flex-1 items-center justify-between tab-sm:ml-unit">
											<Breadcrumbs />
										</div>

										<div className="ml-auto flex h-full shrink-0 items-center gap-unit-mob tab-sm:gap-unit">
											<NotificationBell />
											<SearchButton />
										</div>
									</header>
								</AuthGuard>

								<MainScrollArea>
									<AuthGuard redirectTo="/login">
										<div className="flex min-h-screen min-w-0 flex-col gap-4 overflow-x-clip p-unit-mob tab:p-unit">
											{children}
										</div>
									</AuthGuard>
								</MainScrollArea>
							</SidebarInset>

							<AuthGuard hideOnPublicPath>
								<SearchDialog />
							</AuthGuard>
						</SidebarProvider>
					</BreadcrumbsProvider>
				</AuthProvider>
			</Providers>
		</>
	)
}
