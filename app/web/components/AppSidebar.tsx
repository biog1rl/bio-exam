'use client'

import { ComponentProps, useEffect, useState } from 'react'

import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { NavLinks } from '@/components/nav-links'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'

import LogoSidebar from './LogoSidebar'
import { NavUser } from './nav-user'

interface SidebarItem {
	id: string
	title: string
	url: string
	icon: string
	target: '_self' | '_blank'
	order: number
	isActive: boolean
}

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
	const [links, setLinks] = useState<
		{
			name: string
			url: string
			icon: LucideIcon
			target?: HTMLAnchorElement['target']
		}[]
	>([])

	useEffect(() => {
		fetch('/api/sidebar')
			.then((res) => res.json())
			.then((data) => {
				const items: SidebarItem[] = data.items || []
				const mappedLinks = items.map((item) => {
					// Получаем иконку из lucide-react по имени
					const IconComponent = (Icons as any)[item.icon] || Icons.CircleIcon
					return {
						name: item.title,
						url: item.url,
						icon: IconComponent,
						target: item.target,
					}
				})
				setLinks(mappedLinks)
			})
			.catch((err) => {
				console.error('Failed to load sidebar items:', err)
				// Fallback на дефолтные ссылки при ошибке
				setLinks([])
			})
	}, [])

	return (
		<Sidebar collapsible="none" suppressHydrationWarning {...props}>
			<SidebarHeader className="px-4 pt-4 text-2xl font-semibold">
				<div className="flex items-center justify-between transition">
					<LogoSidebar />
					{/* <AuthGuard requireAny={['settings.manage']}>
						<Link href="/admin/sidebar" className="transition group-data-[collapsible=icon]:opacity-0">
							<Button variant="outline" size="icon">
								<Icons.SettingsIcon size="4" />
							</Button>
						</Link>
					</AuthGuard> */}
				</div>
			</SidebarHeader>
			<SidebarContent className="mt-16">
				<NavLinks links={links} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	)
}
