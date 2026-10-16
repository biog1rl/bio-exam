'use client'

import { useSyncExternalStore } from 'react'

import type { PhotoSource } from './PhotoBlock'

const COARSE_QUERY = '(pointer: coarse)'

const TOUCH_SOURCES: readonly PhotoSource[] = ['camera', 'gallery']

const DESKTOP_SOURCES: readonly PhotoSource[] = ['file']

function subscribe(listener: () => void): () => void {
	const media = window.matchMedia(COARSE_QUERY)
	media.addEventListener('change', listener)
	return () => media.removeEventListener('change', listener)
}

function isCoarse(): boolean {
	return window.matchMedia(COARSE_QUERY).matches
}

export function usePhotoSources(): readonly PhotoSource[] {
	const coarse = useSyncExternalStore(subscribe, isCoarse, () => false)
	return coarse ? TOUCH_SOURCES : DESKTOP_SOURCES
}
