'use client'

import type { PhotoSource } from './PhotoBlock'
import { usePointerKind } from './use-pointer-kind'

const TOUCH_SOURCES: readonly PhotoSource[] = ['camera', 'gallery']

const DESKTOP_SOURCES: readonly PhotoSource[] = ['file']

export function usePhotoSources(): readonly PhotoSource[] {
	return usePointerKind() === 'coarse' ? TOUCH_SOURCES : DESKTOP_SOURCES
}
