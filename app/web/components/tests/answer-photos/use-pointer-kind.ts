'use client'

import { useSyncExternalStore } from 'react'

export type PointerKind = 'fine' | 'coarse' | 'unknown'

const FINE_QUERY = '(pointer: fine)'
const COARSE_QUERY = '(pointer: coarse)'

function subscribe(listener: () => void): () => void {
	const fine = window.matchMedia(FINE_QUERY)
	const coarse = window.matchMedia(COARSE_QUERY)
	fine.addEventListener('change', listener)
	coarse.addEventListener('change', listener)
	return () => {
		fine.removeEventListener('change', listener)
		coarse.removeEventListener('change', listener)
	}
}

function currentKind(): PointerKind {
	if (window.matchMedia(COARSE_QUERY).matches) return 'coarse'
	if (window.matchMedia(FINE_QUERY).matches) return 'fine'
	return 'unknown'
}

function serverKind(): PointerKind {
	return 'unknown'
}

export function usePointerKind(): PointerKind {
	return useSyncExternalStore(subscribe, currentKind, serverKind)
}
