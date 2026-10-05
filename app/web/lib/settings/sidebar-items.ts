import type { PermissionKey } from '@bio-exam/rbac'

import type { RequestFailureKind } from '@/lib/http/request'
import { canAccessSection } from '@/lib/session/route-permissions'

import type { SidebarItem } from './api'

export const SIDEBAR_RELOAD_ERROR = 'Ошибка загрузки пунктов меню'

export const ADMIN_LINK: SidebarItem = {
	id: 'builtin-admin',
	title: 'Админка',
	url: '/admin',
	icon: 'ShieldCheck',
	target: '_self',
	order: Number.MAX_SAFE_INTEGER,
	isActive: false,
}

export function sidebarNavItems(items: readonly SidebarItem[], perms: ReadonlySet<PermissionKey>): SidebarItem[] {
	if (!canAccessSection(perms, 'admin') || items.some((item) => item.url === ADMIN_LINK.url)) return [...items]
	return [...items, ADMIN_LINK]
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
