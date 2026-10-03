'use client'

import { type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { SidebarGroup, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'

export function NavLinks({
	links,
}: {
	links: {
		name: string
		url: string
		icon: LucideIcon
		target?: HTMLAnchorElement['target']
	}[]
}) {
	return (
		<SidebarGroup>
			<SidebarMenu>
				{links.map((item) => (
					<SidebarMenuItem key={item.name}>
						<Link
							className="flex flex-col items-center justify-center gap-2 rounded-xl py-3 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-ring/15 hover:text-sidebar-foreground"
							href={item.url}
							target={item.target}
						>
							<item.icon />
							<span className="text-center text-xs leading-tight font-medium">{item.name}</span>
						</Link>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	)
}
