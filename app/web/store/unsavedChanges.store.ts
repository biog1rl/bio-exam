'use client'

import { create } from 'zustand'

type UnsavedChangesState = {
	dirtyByPath: Record<string, boolean>
	setDirty: (path: string, dirty: boolean) => void
	isDirty: (path: string) => boolean
	clear: (path?: string) => void
}

export const useUnsavedChanges = create<UnsavedChangesState>((set, get) => ({
	dirtyByPath: {},
	setDirty: (path, dirty) =>
		set((state) => ({
			dirtyByPath: { ...state.dirtyByPath, [path]: dirty },
		})),
	isDirty: (path) => !!get().dirtyByPath[path],
	clear: (path) =>
		set((state) => {
			if (!path) return { dirtyByPath: {} }
			const next = { ...state.dirtyByPath }
			delete next[path]
			return { dirtyByPath: next }
		}),
}))
