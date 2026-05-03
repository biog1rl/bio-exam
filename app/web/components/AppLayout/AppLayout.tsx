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
import { getServerMe } from '@/lib/auth/getServerMe'

export default async function AppLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	const me = await getServerMe()

	return (
		<>
			<Providers>
				{/* RBAC-провайдер с SSR-инициализацией */}
				<AuthProvider initialMe={me}>
					<BreadcrumbsProvider>
						<SidebarProvider className="items-center justify-center bg-[#fbfaf7]">
							<AuthGuard>
								<AppSidebar />
							</AuthGuard>

							<SidebarInset className="h-screen bg-[#fbfaf7]">
								<AuthGuard>
									<header className="p-unit sticky top-0 z-10 flex items-center border-b border-[#e6ded2] bg-[#fbfaf7]/90 backdrop-blur-xl">
										<div className="flex h-full items-center gap-4">
											<BackButton className="size-9 cursor-pointer border border-[#e0d6c8] bg-[#fffdf8] text-[#3c4738] transition-colors hover:border-[#cdbb9f] hover:bg-[#f3ecdf]" />
											<Separator className="bg-[#e6ded2]" orientation="vertical" />
										</div>

										<div className="ml-unit flex min-w-0 items-center justify-between">
											<Breadcrumbs />
										</div>

										<div className="gap-unit ml-auto flex h-full items-center">
											<SearchButton />
										</div>
									</header>
								</AuthGuard>

								<ScrollArea className="flex flex-1">
									<AuthGuard redirectTo="/login" skipPaths={['/login']} skipPathPrefixes={['/invite']}>
										<div className="p-unit-mob tab:p-unit flex min-h-screen flex-col gap-4">{children}</div>
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
