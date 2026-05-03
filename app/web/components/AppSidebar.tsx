'use client'

import { ComponentProps, useEffect, useState } from 'react'

import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils/cn'

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
			isActive: boolean
		}[]
	>([])
	const pathname = usePathname()

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
						isActive: item.isActive,
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
		<Sidebar className="border-r border-[#ded6c7] bg-[#f8f5ee]" collapsible="none" suppressHydrationWarning {...props}>
			<SidebarHeader className="border-b border-[#e4dccf] px-4 py-4 text-2xl font-semibold">
				<div className="flex items-center justify-center transition-colors">
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
			<SidebarContent className="px-2 py-5">
				<nav aria-label="Main navigation">
					<ul className="flex w-full min-w-0 flex-col gap-2">
						{links.map((item) => {
							const isActive =
								item.isActive || pathname === item.url || (item.url !== '/' && pathname.startsWith(`${item.url}/`))
							const Icon = item.icon

							return (
								<li key={item.name}>
									<Link
										className={cn(
											'flex min-h-16 flex-col items-center justify-center gap-2 rounded-lg border px-2 py-3 text-center text-xs font-medium leading-tight transition-colors',
											'border-transparent bg-transparent text-[#5d684f] hover:border-[#d7c7b2] hover:bg-[#f0eadf] hover:text-[#253625] focus-visible:border-[#b9a37f] focus-visible:bg-[#f0eadf] focus-visible:text-[#253625] focus-visible:outline-none',
											isActive && 'border-[#b9a37f] bg-[#ebe2d3] text-[#243824]'
										)}
										href={item.url}
										target={item.target}
										aria-current={isActive ? 'page' : undefined}
									>
										<Icon className="size-4 shrink-0" />
										<span className="max-w-full truncate">{item.name}</span>
									</Link>
								</li>
							)
						})}
					</ul>
				</nav>
			</SidebarContent>
			<SidebarFooter className="border-t border-[#e4dccf] p-2">
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	)
}
