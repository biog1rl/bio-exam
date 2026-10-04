import { unstable_rethrow } from 'next/navigation'

import { Providers } from '@/app/providers'
import { AppSidebar } from '@/components/AppSidebar'
import Breadcrumbs from '@/components/Breadcrumbs'
import { BreadcrumbsProvider } from '@/components/Breadcrumbs/BreadcrumbsContext'
import BackButton from '@/components/Buttons/BackButton'
import SearchButton from '@/components/Search/SearchButton'
import SearchDialog from '@/components/Search/SearchDialog'
import AuthGuard from '@/components/auth/AuthGuard'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { getServerMe, type ServerMe } from '@/lib/session/server'

export default async function AppLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	let me: ServerMe | null = null
	let sessionError = false
	try {
		me = await getServerMe()
	} catch (error) {
		unstable_rethrow(error)
		sessionError = true
	}

	return (
		<>
			<Providers>
				{/* RBAC-провайдер с SSR-инициализацией */}
				<AuthProvider initialMe={me} sessionError={sessionError}>
					<BreadcrumbsProvider>
						<SidebarProvider className="items-center justify-center bg-[#fbfaf7]">
							<AuthGuard>
								<AppSidebar />
							</AuthGuard>

							<SidebarInset className="h-screen min-w-0 overflow-hidden bg-[#fbfaf7]">
								<AuthGuard>
									<header className="sticky top-0 z-10 flex min-w-0 items-center border-b border-[#e6ded2] bg-[#fbfaf7]/90 p-unit backdrop-blur-xl">
										<div className="flex h-full shrink-0 items-center gap-4">
											<BackButton className="size-9 cursor-pointer border border-[#e0d6c8] bg-[#fffdf8] text-[#3c4738] transition-colors hover:border-[#cdbb9f] hover:bg-[#f3ecdf]" />
											<Separator className="hidden bg-[#e6ded2] mob:block" orientation="vertical" />
										</div>

										<div className="ml-unit-mob flex min-w-0 flex-1 items-center justify-between tab-sm:ml-unit">
											<Breadcrumbs />
										</div>

										<div className="ml-auto flex h-full shrink-0 items-center gap-unit-mob tab-sm:gap-unit">
											<SearchButton />
										</div>
									</header>
								</AuthGuard>

								<ScrollArea className="flex min-w-0 flex-1">
									<AuthGuard redirectTo="/login" skipPaths={['/login']} skipPathPrefixes={['/invite']}>
										<div className="flex min-h-screen min-w-0 flex-col gap-4 overflow-x-hidden p-unit-mob tab:p-unit">
											{children}
										</div>
									</AuthGuard>
								</ScrollArea>
							</SidebarInset>

							<SearchDialog />
						</SidebarProvider>
					</BreadcrumbsProvider>
				</AuthProvider>
			</Providers>
			<Toaster />
		</>
	)
}
