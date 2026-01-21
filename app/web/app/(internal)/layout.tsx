import { AppSidebar } from '@/components/AppSidebar'
import Breadcrumbs from '@/components/Breadcrumbs'
import { BreadcrumbsProvider } from '@/components/Breadcrumbs/BreadcrumbsContext'
import BackButton from '@/components/Buttons/BackButton'
import SearchButton from '@/components/Search/SearchButton'
import SearchDialog from '@/components/Search/SearchDialog'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import AuthGuard from '@/components/auth/AuthGuard'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { getServerMe } from '@/lib/auth/getServerMe'
import '@/styles/globals.css'

import { Providers } from '../providers'

export default async function RootLayout({
	children,
	docsSidebar,
}: Readonly<{
	children: React.ReactNode
	docsSidebar: React.ReactNode
}>) {
	const me = await getServerMe()

	return (
		<>
			<Providers>
				{/* RBAC-провайдер с SSR-инициализацией */}
				<AuthProvider initialMe={me}>
					<BreadcrumbsProvider>
						<SidebarProvider>
							<AuthGuard>
								<AppSidebar />
							</AuthGuard>

							<SidebarInset className="h-screen">
								<AuthGuard>
									<header className="dark:bg-background p-unit sticky top-0 z-10 flex items-center border-b bg-white">
										<div className="flex h-full items-center gap-4">
											<BackButton className="size-9 cursor-pointer" />
											<Separator orientation="vertical" />
										</div>

										<div className="ml-unit flex min-w-0 items-center justify-between">
											<Breadcrumbs />
										</div>

										<div className="gap-unit ml-auto flex h-full items-center">
											<SearchButton />
											<ThemeSwitcher />
										</div>
									</header>
								</AuthGuard>

								<ScrollArea className="flex flex-1">
									<div className="p-unit-mob tab:p-unit flex flex-col gap-4">{children}</div>
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
