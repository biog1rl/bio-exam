'use client'

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type Ctx = {
	open: boolean
	setOpen: (v: boolean) => void
	openDialog: () => void
	closeDialog: () => void
}

const SearchCtx = createContext<Ctx | null>(null)

export const useSearch = () => {
	const ctx = useContext(SearchCtx)
	if (!ctx) throw new Error('useSearch must be used within <SearchProvider>')
	return ctx
}

export function SearchProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false)

	const openDialog = useCallback(() => setOpen(true), [])
	const closeDialog = useCallback(() => setOpen(false), [])

	useEffect(() => {
		const isTypingInEditable = (t: EventTarget | null) => {
			if (!(t instanceof HTMLElement)) return false
			if (t.isContentEditable) return true
			const tag = t.tagName
			return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
		}

		const onKey = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey
			const isK = e.code === 'KeyK' || e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'л'

			if (!isMod || !isK) return
			if (e.altKey) return
			if (e.repeat) return
			if (isTypingInEditable(e.target)) return

			e.preventDefault()
			setOpen((v) => !v)
		}

		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	const ctx = useMemo<Ctx>(() => ({ open, setOpen, openDialog, closeDialog }), [open, openDialog, closeDialog])

	return <SearchCtx.Provider value={ctx}>{children}</SearchCtx.Provider>
}
