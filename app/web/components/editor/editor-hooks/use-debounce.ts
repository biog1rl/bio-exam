import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { createDebounced, type Debounced } from './debounced'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function useLatestRef<T>(value: T): { readonly current: T } {
	const ref = useRef(value)
	useIsomorphicLayoutEffect(() => {
		ref.current = value
	})
	return ref
}

function callLatest<A extends unknown[]>(ref: { readonly current: (...args: A) => void }): (...args: A) => void {
	return (...args) => ref.current(...args)
}

export function useDebounce<T extends (...args: never[]) => void>(
	fn: T,
	ms: number,
	maxWait?: number
): Debounced<Parameters<T>> {
	const fnRef = useLatestRef(fn)

	const debounced = useMemo(
		() =>
			createDebounced(callLatest<Parameters<T>>(fnRef), ms, {
				maxWait: maxWait ?? ms,
			}),
		[fnRef, ms, maxWait]
	)

	useEffect(() => () => debounced.cancel(), [debounced])

	return debounced
}
