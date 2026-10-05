'use client'

import { create } from 'zustand'

import { type LeaveFlushResult, leaveDialogDescription } from '@/lib/drafts/draft-ui'

export type LeaveDecision = { kind: 'navigate' } | { kind: 'confirm'; description: string }

type LeaveFlush = () => Promise<LeaveFlushResult>

type UnsavedChangesState = {
	dirtyByPath: Record<string, boolean>
	flushByPath: Record<string, LeaveFlush>
	leavingByPath: Record<string, boolean>
	setDirty: (path: string, dirty: boolean) => void
	isDirty: (path: string) => boolean
	registerFlush: (path: string, flush: LeaveFlush | null) => void
	leave: (path: string) => Promise<LeaveDecision>
	clear: (path: string) => void
}

const FAILED_FLUSH: LeaveFlushResult = { ok: false, reason: 'failed' }

const pendingLeaves = new Map<string, Promise<LeaveDecision>>()

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
	if (!(key in record)) return record
	const next = { ...record }
	delete next[key]
	return next
}

function decide(result: LeaveFlushResult): LeaveDecision {
	return result.ok ? { kind: 'navigate' } : { kind: 'confirm', description: leaveDialogDescription(result) }
}

export const useUnsavedChanges = create<UnsavedChangesState>((set, get) => ({
	dirtyByPath: {},
	flushByPath: {},
	leavingByPath: {},
	setDirty: (path, dirty) =>
		set((state) => ({
			dirtyByPath: { ...state.dirtyByPath, [path]: dirty },
		})),
	isDirty: (path) => !!get().dirtyByPath[path],
	registerFlush: (path, flush) =>
		set((state) => ({
			flushByPath: flush ? { ...state.flushByPath, [path]: flush } : without(state.flushByPath, path),
		})),
	leave: (path) => {
		const pending = pendingLeaves.get(path)
		if (pending) return pending

		const flush = get().flushByPath[path]
		if (!flush) {
			return Promise.resolve<LeaveDecision>(
				get().dirtyByPath[path] ? { kind: 'confirm', description: leaveDialogDescription(null) } : { kind: 'navigate' }
			)
		}

		set((state) => ({ leavingByPath: { ...state.leavingByPath, [path]: true } }))
		const decision = new Promise<LeaveFlushResult>((resolve) => resolve(flush()))
			.catch(() => FAILED_FLUSH)
			.then(decide)
			.finally(() => {
				pendingLeaves.delete(path)
				set((state) => ({ leavingByPath: { ...state.leavingByPath, [path]: false } }))
			})
		pendingLeaves.set(path, decision)
		return decision
	},
	clear: (path) =>
		set((state) => ({
			dirtyByPath: without(state.dirtyByPath, path),
			flushByPath: without(state.flushByPath, path),
		})),
}))
