'use client'

import { type LucideIcon } from 'lucide-react'
import Link from 'next/link'

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

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
						<SidebarMenuButton asChild>
							<Link href={item.url} target={item.target}>
								<item.icon />
								<span>{item.name}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	)
}
