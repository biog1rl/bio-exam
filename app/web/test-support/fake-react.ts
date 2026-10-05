import type * as React from 'react'

type Deps = readonly unknown[] | undefined
type Cleanup = void | (() => void)
type EffectKind = 'layout' | 'passive'

type EffectCell = {
	kind: 'effect'
	effectKind: EffectKind
	deps: Deps
	create: () => Cleanup
	cleanup: (() => void) | null
	pending: boolean
}
type MemoCell = { kind: 'memo'; deps: Deps; value: unknown }
type RefCell = { kind: 'ref'; ref: { current: unknown } }
type StateCell = { kind: 'state'; value: unknown; setter: (next: unknown) => void }
type Cell = EffectCell | MemoCell | RefCell | StateCell

export type EffectRecord = { kind: EffectKind; deps: Deps; runs: number; cleanups: number }

export type Harness = {
	render<T>(component: () => T): T
	renderPhase<T>(component: () => T): T
	commit(): void
	unmount(): void
	strictRemount(): void
	effects(): EffectRecord[]
	stateUpdates(): number
	stateUpdatesAfterUnmount(): number
	readonly mounted: boolean
}

type HarnessState = {
	cells: Cell[]
	index: number
	records: EffectRecord[]
	stateUpdates: number
	stateUpdatesAfterUnmount: number
	mounted: boolean
}

let current: HarnessState | null = null

function active(): HarnessState {
	if (!current) throw new Error('hook called outside fake render')
	return current
}

function depsChanged(prev: Deps, next: Deps): boolean {
	if (prev === undefined || next === undefined) return true
	if (prev.length !== next.length) return true
	return prev.some((value, index) => !Object.is(value, next[index]))
}

function nextCell<C extends Cell>(state: HarnessState, kind: C['kind'], init: () => C): C {
	const index = state.index++
	const existing = state.cells[index]
	if (existing === undefined) {
		const cell = init()
		state.cells[index] = cell
		return cell
	}
	if (existing.kind !== kind) throw new Error(`hook order changed at ${index}: ${existing.kind} -> ${kind}`)
	return existing as C
}

function registerEffect(effectKind: EffectKind, create: () => Cleanup, deps: Deps): void {
	const state = active()
	const cellIndex = state.index
	const cell = nextCell<EffectCell>(state, 'effect', () => ({
		kind: 'effect',
		effectKind,
		deps: undefined,
		create,
		cleanup: null,
		pending: true,
	}))
	const record = state.records[cellIndex] ?? { kind: effectKind, deps, runs: 0, cleanups: 0 }
	record.deps = deps
	state.records[cellIndex] = record
	if (cell.pending || depsChanged(cell.deps, deps)) {
		cell.create = create
		cell.deps = deps
		cell.pending = true
	}
}

function useEffect(create: () => Cleanup, deps?: Deps): void {
	registerEffect('passive', create, deps)
}

function useLayoutEffect(create: () => Cleanup, deps?: Deps): void {
	registerEffect('layout', create, deps)
}

function memoize<T>(factory: () => T, deps: Deps): T {
	const state = active()
	const cell = nextCell<MemoCell>(state, 'memo', () => ({ kind: 'memo', deps: undefined, value: undefined }))
	if (cell.deps === undefined || depsChanged(cell.deps, deps)) {
		cell.value = factory()
		cell.deps = deps
	}
	return cell.value as T
}

function useMemo<T>(factory: () => T, deps: Deps): T {
	return memoize(factory, deps)
}

function useCallback<T>(callback: T, deps: Deps): T {
	return memoize(() => callback, deps)
}

function useRef<T>(initial: T): { current: T } {
	const state = active()
	const cell = nextCell<RefCell>(state, 'ref', () => ({ kind: 'ref', ref: { current: initial } }))
	return cell.ref as { current: T }
}

function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
	const state = active()
	const cell = nextCell<StateCell>(state, 'state', () => {
		const created: StateCell = {
			kind: 'state',
			value: typeof initial === 'function' ? (initial as () => T)() : initial,
			setter: (next) => {
				if (!state.mounted) state.stateUpdatesAfterUnmount++
				state.stateUpdates++
				created.value = typeof next === 'function' ? (next as (prev: unknown) => unknown)(created.value) : next
			},
		}
		return created
	})
	return [cell.value as T, cell.setter as (next: T | ((prev: T) => T)) => void]
}

function useContext<T>(context: React.Context<T>): T {
	return (context as unknown as { _currentValue: T })._currentValue
}

function useSyncExternalStore<T>(_subscribe: (onChange: () => void) => () => void, getSnapshot: () => T): T {
	return getSnapshot()
}

export const fakeHooks = {
	useEffect,
	useLayoutEffect,
	useMemo,
	useCallback,
	useRef,
	useState,
	useContext,
	useSyncExternalStore,
}

export function mockReact(actual: Record<string, unknown>): Record<string, unknown> {
	const base = (actual.default ?? actual) as Record<string, unknown>
	return { ...actual, ...fakeHooks, default: { ...base, ...fakeHooks } }
}

function effectCells(state: HarnessState): Array<{ cell: EffectCell; record: EffectRecord }> {
	const result: Array<{ cell: EffectCell; record: EffectRecord }> = []
	state.cells.forEach((cell, index) => {
		const record = state.records[index]
		if (cell.kind === 'effect' && record) result.push({ cell, record })
	})
	return result
}

function runCleanup(cell: EffectCell, record: EffectRecord): void {
	if (!cell.cleanup) return
	const cleanup = cell.cleanup
	cell.cleanup = null
	record.cleanups++
	cleanup()
}

function runCreate(cell: EffectCell, record: EffectRecord): void {
	cell.pending = false
	record.runs++
	const cleanup = cell.create()
	cell.cleanup = typeof cleanup === 'function' ? cleanup : null
}

export function createHarness(): Harness {
	const state: HarnessState = {
		cells: [],
		index: 0,
		records: [],
		stateUpdates: 0,
		stateUpdatesAfterUnmount: 0,
		mounted: false,
	}

	function renderPhase<T>(component: () => T): T {
		const previous = current
		current = state
		state.index = 0
		try {
			return component()
		} finally {
			current = previous
		}
	}

	function commitKind(kind: EffectKind): void {
		const pending = effectCells(state).filter(({ cell }) => cell.effectKind === kind && cell.pending)
		for (const { cell, record } of pending) runCleanup(cell, record)
		for (const { cell, record } of pending) runCreate(cell, record)
	}

	function commit(): void {
		state.mounted = true
		commitKind('layout')
		commitKind('passive')
	}

	function cleanupAll(): void {
		const all = effectCells(state)
		for (const kind of ['layout', 'passive'] as const) {
			for (const { cell, record } of all) if (cell.effectKind === kind) runCleanup(cell, record)
		}
	}

	return {
		render(component) {
			const result = renderPhase(component)
			commit()
			return result
		},
		renderPhase,
		commit,
		unmount() {
			state.mounted = false
			cleanupAll()
		},
		strictRemount() {
			cleanupAll()
			for (const kind of ['layout', 'passive'] as const) {
				for (const { cell, record } of effectCells(state)) if (cell.effectKind === kind) runCreate(cell, record)
			}
		},
		effects: () => state.records.filter((record): record is EffectRecord => record !== undefined),
		stateUpdates: () => state.stateUpdates,
		stateUpdatesAfterUnmount: () => state.stateUpdatesAfterUnmount,
		get mounted() {
			return state.mounted
		},
	}
}
