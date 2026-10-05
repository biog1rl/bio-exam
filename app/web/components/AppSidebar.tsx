'use client'

import { ComponentProps, type CSSProperties, useEffect, useMemo, useState } from 'react'

import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { NAV_ICONS } from '@/components/navigation/nav-icons'
import { useAuth } from '@/components/providers/AuthProvider'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from '@/components/ui/sidebar'
import { extraMenuLinks, menuGroups } from '@/lib/navigation/sections'
import { getSidebarItems, type SidebarItem } from '@/lib/settings/api'
import { activeSidebarUrl } from '@/lib/settings/sidebar-items'
import { cn } from '@/lib/utils/cn'

import { NavUser } from './nav-user'

type NavLink = {
	key: string
	title: string
	href: string
	icon: LucideIcon
	target?: HTMLAnchorElement['target']
}

type NavBlock = {
	key: string
	title: string | null
	links: NavLink[]
}

const EXTRA_LINKS_TITLE = 'Ссылки'

const HEADER_IMAGE_STYLE: CSSProperties = {
	backgroundImage: 'url(/img/main-bg.jpg)',
	backgroundSize: '140% auto',
	backgroundPosition: '90% 50%',
}

function linkIcon(name: string): LucideIcon {
	return (Icons as unknown as Record<string, LucideIcon | undefined>)[name] ?? Icons.CircleIcon
}

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
	const [items, setItems] = useState<SidebarItem[]>([])
	const { perms } = useAuth()
	const pathname = usePathname()
	const { setOpenMobile } = useSidebar()

	useEffect(() => {
		setOpenMobile(false)
	}, [pathname, setOpenMobile])

	useEffect(() => {
		const controller = new AbortController()
		void getSidebarItems(controller.signal).then((outcome) => {
			if (!outcome.ok) return
			setItems(outcome.data)
		})
		return () => controller.abort()
	}, [])

	const blocks = useMemo<NavBlock[]>(() => {
		const sections = menuGroups(perms).map((group) => ({
			key: group.key,
			title: group.key === 'main' ? null : group.title,
			links: group.sections.map((section) => ({
				key: section.key,
				title: section.title,
				href: section.href,
				icon: NAV_ICONS[section.icon],
			})),
		}))
		const extra = extraMenuLinks(items).map((item) => ({
			key: item.id,
			title: item.title,
			href: item.url,
			icon: linkIcon(item.icon),
			target: item.target,
		}))
		return extra.length > 0 ? [...sections, { key: 'links', title: EXTRA_LINKS_TITLE, links: extra }] : sections
	}, [items, perms])

	const activeHref = activeSidebarUrl(
		blocks.flatMap((block) => block.links.map((link) => link.href)),
		pathname
	)

	return (
		<Sidebar className="border-r border-sidebar-border" collapsible="none" suppressHydrationWarning {...props}>
			<SidebarHeader
				className="relative h-20 shrink-0 overflow-hidden bg-no-repeat p-0"
				style={HEADER_IMAGE_STYLE}
				aria-hidden="true"
			>
				<div className="absolute inset-0 bg-linear-to-b from-transparent via-sidebar/20 to-sidebar" />
			</SidebarHeader>
			<SidebarContent className="px-3 py-4">
				<nav aria-label="Основная навигация" className="flex flex-col gap-5">
					{blocks.map((block) => (
						<div key={block.key} className="flex flex-col gap-1">
							{block.title ? (
								<p className="px-3 pb-1 font-mono text-[0.6875rem] tracking-[0.18em] text-sidebar-foreground/75 uppercase">
									{block.title}
								</p>
							) : null}
							<ul className="flex flex-col gap-1">
								{block.links.map((link) => {
									const isActive = link.href === activeHref
									const Icon = link.icon
									return (
										<li key={link.key}>
											<Link
												href={link.href}
												target={link.target}
												aria-current={isActive ? 'page' : undefined}
												className={cn(
													'flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
													isActive
														? 'bg-sidebar-primary text-sidebar-primary-foreground'
														: 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
												)}
											>
												<Icon className="size-4 shrink-0" aria-hidden="true" />
												<span className="truncate">{link.title}</span>
											</Link>
										</li>
									)
								})}
							</ul>
						</div>
					))}
				</nav>
			</SidebarContent>
			<SidebarFooter className="border-t border-sidebar-border p-2">
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	)
}
