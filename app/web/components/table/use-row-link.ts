'use client'

import type { MouseEvent } from 'react'

import { useRouter } from 'next/navigation'

const INTERACTIVE =
	'a, button, input, select, textarea, label, [role="menuitem"], [role="menuitemcheckbox"], [role="checkbox"], [role="switch"]'

export function useRowLink() {
	const router = useRouter()
	return (href: string) => ({
		onClick: (event: MouseEvent<HTMLTableRowElement>) => {
			const target = event.target as Element
			if (!event.currentTarget.contains(target) || target.closest(INTERACTIVE)) return
			if (window.getSelection()?.toString()) return
			if (event.metaKey || event.ctrlKey) {
				window.open(href, '_blank', 'noopener')
				return
			}
			router.push(href)
		},
	})
}
