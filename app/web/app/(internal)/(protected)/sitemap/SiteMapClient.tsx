'use client'

import { useState } from 'react'

import Link from 'next/link'

import { NAV_ICONS } from '@/components/navigation/nav-icons'
import { EmptyState } from '@/components/page/EmptyState'
import { PageHeader } from '@/components/page/PageHeader'
import { ToolbarSearch } from '@/components/page/ToolbarSearch'
import { Button } from '@/components/ui/button'
import type { NavGroupKey, NavIcon } from '@/lib/navigation/sections'

export type SiteMapTile = { href: string; title: string; icon: NavIcon; description: string }

export type SiteMapGroup = { key: NavGroupKey; title: string; tiles: SiteMapTile[] }

function matches(tile: SiteMapTile, needle: string): boolean {
	return (
		tile.title.toLocaleLowerCase('ru').includes(needle) || tile.description.toLocaleLowerCase('ru').includes(needle)
	)
}

export function SiteMapClient({ title, groups }: { title: string; groups: SiteMapGroup[] }) {
	const [query, setQuery] = useState('')
	const needle = query.trim().toLocaleLowerCase('ru')
	const visible = needle
		? groups
				.map((group) => ({ ...group, tiles: group.tiles.filter((tile) => matches(tile, needle)) }))
				.filter((group) => group.tiles.length > 0)
		: groups

	return (
		<div className="space-y-4">
			<PageHeader title={title}>
				<ToolbarSearch value={query} onChange={setQuery} label="Поиск разделов" placeholder="Название раздела" />
			</PageHeader>

			{visible.length === 0 ? (
				<EmptyState
					description="Ничего не найдено."
					action={
						<Button variant="outline" className="rounded-full" onClick={() => setQuery('')}>
							Сбросить поиск
						</Button>
					}
				/>
			) : (
				visible.map((group) => (
					<section key={group.key} aria-labelledby={`sitemap-${group.key}`} className="space-y-3">
						<h2 id={`sitemap-${group.key}`} className="text-lg font-semibold">
							{group.title}
						</h2>
						<ul className="grid gap-3 tab-sm:grid-cols-2 tab:grid-cols-3">
							{group.tiles.map((tile) => {
								const Icon = NAV_ICONS[tile.icon]
								return (
									<li key={tile.href}>
										<Link
											href={tile.href}
											className="group flex h-full items-start gap-3 rounded-3xl border border-border/80 bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/45 hover:bg-secondary/55 focus-visible:border-primary focus-visible:bg-secondary/55 focus-visible:outline-none"
										>
											<Icon
												className="mt-0.5 size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
												aria-hidden="true"
											/>
											<span className="min-w-0 space-y-0.5">
												<span className="block font-medium text-foreground transition-colors group-hover:text-primary">
													{tile.title}
												</span>
												<span className="block text-sm text-muted-foreground">{tile.description}</span>
											</span>
										</Link>
									</li>
								)
							})}
						</ul>
					</section>
				))
			)}
		</div>
	)
}
