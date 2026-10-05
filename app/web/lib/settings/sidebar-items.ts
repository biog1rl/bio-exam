import type { RequestFailureKind } from '@/lib/http/request'

import type { SidebarItem } from './api'

export const SIDEBAR_RELOAD_ERROR = 'Ошибка загрузки пунктов меню'

function normalizePath(url: string): string {
	return url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url
}

function matchesPath(url: string, pathname: string): boolean {
	if (!url.startsWith('/')) return false
	const base = normalizePath(url)
	if (base === '/') return pathname === '/'
	return pathname === base || pathname.startsWith(`${base}/`)
}

export function activeSidebarUrl(urls: readonly string[], pathname: string): string | null {
	let active: string | null = null
	for (const url of urls) {
		if (!matchesPath(url, pathname)) continue
		if (active === null || normalizePath(url).length > normalizePath(active).length) active = url
	}
	return active
}

export type SidebarReloadFailure = 'silent' | 'block' | 'toast'

export function sidebarReloadFailure(input: { loaded: boolean; kind: RequestFailureKind }): SidebarReloadFailure {
	if (input.kind === 'auth' || input.kind === 'aborted') return 'silent'
	return input.loaded ? 'toast' : 'block'
}

export function moveSidebarItem(items: readonly SidebarItem[], activeId: string, overId: string): SidebarItem[] | null {
	if (activeId === overId) return null
	const from = items.findIndex((item) => item.id === activeId)
	const to = items.findIndex((item) => item.id === overId)
	if (from < 0 || to < 0) return null
	const next = [...items]
	const [moved] = next.splice(from, 1)
	if (!moved) return null
	next.splice(to, 0, moved)
	return next.map((item, index) => ({ ...item, order: index }))
}
