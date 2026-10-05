'use client'

import { useRef } from 'react'

type AutoFocusHandler = (event: Event) => void

export function useReturnFocus(onOpenAutoFocus?: AutoFocusHandler, onCloseAutoFocus?: AutoFocusHandler) {
	const returnTo = useRef<HTMLElement | null>(null)
	return {
		onOpenAutoFocus: (event: Event) => {
			const active = document.activeElement
			returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null
			onOpenAutoFocus?.(event)
		},
		onCloseAutoFocus: (event: Event) => {
			onCloseAutoFocus?.(event)
			const target = returnTo.current
			returnTo.current = null
			if (event.defaultPrevented || !target?.isConnected) return
			event.preventDefault()
			target.focus({ preventScroll: true })
		},
	}
}
