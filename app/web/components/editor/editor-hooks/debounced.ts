export type DebounceTimers = {
	setTimer: (callback: () => void, ms: number) => unknown
	clearTimer: (handle: unknown) => void
	now: () => number
}

export type Debounced<A extends unknown[]> = ((...args: A) => void) & { cancel(): void; flush(): void }

const defaultTimers: DebounceTimers = {
	setTimer: (callback, ms) => setTimeout(callback, ms),
	clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
	now: () => Date.now(),
}

export function createDebounced<A extends unknown[]>(
	fn: (...args: A) => void,
	ms: number,
	options: { maxWait?: number; timers?: DebounceTimers } = {}
): Debounced<A> {
	const { setTimer, clearTimer, now } = options.timers ?? defaultTimers
	const wait = Math.max(0, ms)
	const maxWait = options.maxWait === undefined ? null : Math.max(options.maxWait, wait)
	let pendingArgs: A | null = null
	let lastCallAt: number | null = null
	let lastInvokeAt = 0
	let timer: unknown = null
	let hasTimer = false

	function arm(delay: number): void {
		timer = setTimer(onTimer, delay)
		hasTimer = true
	}

	function disarm(): void {
		if (hasTimer) clearTimer(timer)
		timer = null
		hasTimer = false
	}

	function invoke(at: number): void {
		const args = pendingArgs
		pendingArgs = null
		lastInvokeAt = at
		if (args) fn(...args)
	}

	function shouldInvoke(at: number): boolean {
		if (lastCallAt === null) return true
		const sinceCall = at - lastCallAt
		return sinceCall >= wait || sinceCall < 0 || (maxWait !== null && at - lastInvokeAt >= maxWait)
	}

	function remaining(at: number): number {
		const waiting = wait - (at - (lastCallAt ?? at))
		return maxWait === null ? waiting : Math.min(waiting, maxWait - (at - lastInvokeAt))
	}

	function trailing(at: number): void {
		timer = null
		hasTimer = false
		if (pendingArgs) invoke(at)
	}

	function onTimer(): void {
		const at = now()
		if (shouldInvoke(at)) {
			trailing(at)
			return
		}
		arm(remaining(at))
	}

	const debounced = ((...args: A) => {
		const at = now()
		const invoking = shouldInvoke(at)
		pendingArgs = args
		lastCallAt = at
		if (invoking) {
			if (!hasTimer) {
				lastInvokeAt = at
				arm(wait)
				return
			}
			if (maxWait !== null) {
				disarm()
				arm(wait)
				invoke(at)
				return
			}
		}
		if (!hasTimer) arm(wait)
	}) as Debounced<A>

	debounced.cancel = () => {
		disarm()
		lastInvokeAt = 0
		pendingArgs = null
		lastCallAt = null
	}

	debounced.flush = () => {
		if (!hasTimer) return
		disarm()
		trailing(now())
	}

	return debounced
}
