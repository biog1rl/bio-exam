'use client'

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

import { usePathname } from 'next/navigation'

import { ScrollArea } from '@/components/ui/scroll-area'
import { createScrollMemory, type NavigationKind } from '@/lib/navigation/scroll-memory'

const memory = createScrollMemory()

function locationKey(): string {
	return `${window.location.pathname}${window.location.search}`
}

export function MainScrollArea({ children }: { children: ReactNode }) {
	const viewportRef = useRef<HTMLDivElement>(null)
	const navigationKind = useRef<NavigationKind>('push')
	const pathname = usePathname()

	useEffect(() => {
		const viewport = viewportRef.current
		const navigation = (window as { navigation?: EventTarget }).navigation
		const onNavigate = (event: Event) => {
			const type = (event as Event & { navigationType?: string }).navigationType
			if (type !== 'push' && type !== 'traverse') return
			if (viewport) memory.save(locationKey(), viewport.scrollTop)
			navigationKind.current = type === 'traverse' ? 'pop' : 'push'
		}
		const onPopState = () => {
			navigationKind.current = 'pop'
		}
		const onScroll = () => {
			if (viewport) memory.save(locationKey(), viewport.scrollTop)
		}
		navigation?.addEventListener('navigate', onNavigate)
		window.addEventListener('popstate', onPopState, { capture: true })
		viewport?.addEventListener('scroll', onScroll, { passive: true })
		return () => {
			navigation?.removeEventListener('navigate', onNavigate)
			window.removeEventListener('popstate', onPopState, { capture: true })
			viewport?.removeEventListener('scroll', onScroll)
		}
	}, [])

	useLayoutEffect(() => {
		const viewport = viewportRef.current
		const kind = navigationKind.current
		navigationKind.current = 'push'
		if (!viewport) return
		const top = memory.target(locationKey(), kind, window.location.hash.length > 1)
		if (top !== null) viewport.scrollTop = top
	}, [pathname])

	return (
		<ScrollArea className="flex min-w-0 flex-1" viewportClassName="[&>div]:block!" viewportRef={viewportRef}>
			{children}
		</ScrollArea>
	)
}
