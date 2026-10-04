export type SaveOutcome =
	| { kind: 'ok' }
	| { kind: 'retry' }
	| { kind: 'stop'; status: number }
	| { kind: 'reject'; status: number }

export type SaveQueueClock = {
	now: () => number
	setTimer: (callback: () => void, ms: number) => unknown
	clearTimer: (handle: unknown) => void
}

export type SaveQueueOptions<V> = {
	send: (key: string, value: V, options: { keepalive: boolean }) => Promise<SaveOutcome>
	debounceMs: number
	maxWaitMs: number
	retryDelaysMs?: readonly number[]
	clock?: Partial<SaveQueueClock>
	onChange?: () => void
}

export type SaveQueueState = {
	pending: readonly string[]
	rejected: readonly string[]
	inFlight: string | null
	failure: null | { kind: 'retrying'; attempt: number } | { kind: 'stopped'; status: number }
	oldestPendingSince: number | null
}

export type FlushResult = { ok: true } | { ok: false; outcome: SaveOutcome }

export type SaveQueue<V> = {
	set(key: string, value: V): void
	flush(): Promise<FlushResult>
	drain(options: { keepalive: boolean }): void
	retryNow(): void
	resume(): void
	getState(): SaveQueueState
	discard(): void
	close(): Promise<void>
	dispose(): void
}

export const SAVE_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 5000, 10000, 30000]

const RETRY: SaveOutcome = { kind: 'retry' }

type PendingMark = { version: number; at: number }

type Entry<V> = {
	value: V
	version: number
	due: boolean
	sentVersion: number
	marks: PendingMark[]
}

type FlushWaiter = {
	targets: Map<string, number>
	resolve: (result: FlushResult) => void
}

export function createSaveQueue<V>(options: SaveQueueOptions<V>): SaveQueue<V> {
	const { send, debounceMs, maxWaitMs, onChange } = options
	const retryDelaysMs = options.retryDelaysMs?.length ? options.retryDelaysMs : SAVE_RETRY_DELAYS_MS
	const now = options.clock?.now ?? (() => Date.now())
	const setTimer = options.clock?.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
	const clearTimer =
		options.clock?.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

	const entries = new Map<string, Entry<V>>()
	const rejected = new Set<string>()
	const acked = new Map<string, number>()
	let flushWaiters: FlushWaiter[] = []
	let closeWaiters: Array<() => void> = []
	let inFlight: { key: string; version: number } | null = null
	let failure: SaveQueueState['failure'] = null
	let attempt = 0
	let generation = 0
	let versionSeq = 0
	let closed = false
	let disposed = false
	let debounceTimer: unknown = null
	let maxWaitTimer: unknown = null
	let retryTimer: unknown = null
	let snapshot: SaveQueueState | null = null

	function isActive(): boolean {
		return !closed && !disposed
	}

	function isStopped(): boolean {
		return failure?.kind === 'stopped'
	}

	function notify(): void {
		snapshot = null
		onChange?.()
	}

	function cancel(handle: unknown): null {
		if (handle !== null) clearTimer(handle)
		return null
	}

	function clearTimers(): void {
		debounceTimer = cancel(debounceTimer)
		maxWaitTimer = cancel(maxWaitTimer)
		retryTimer = cancel(retryTimer)
	}

	function isSendingLatest(key: string, entry: Entry<V>): boolean {
		return inFlight !== null && inFlight.key === key && inFlight.version === entry.version
	}

	function markDue(): void {
		for (const [key, entry] of entries) {
			if (!isSendingLatest(key, entry)) entry.due = true
		}
	}

	function retryDelayFor(count: number): number {
		return retryDelaysMs[Math.min(count - 1, retryDelaysMs.length - 1)] ?? 0
	}

	function clearRetrying(): void {
		attempt = 0
		if (failure?.kind === 'retrying') failure = null
	}

	function invoke(key: string, value: V, keepalive: boolean): Promise<SaveOutcome> {
		try {
			return Promise.resolve(send(key, value, { keepalive })).catch(() => RETRY)
		} catch {
			return Promise.resolve(RETRY)
		}
	}

	function acknowledge(key: string, version: number): void {
		acked.set(key, Math.max(acked.get(key) ?? 0, version))
		const entry = entries.get(key)
		if (!entry) return
		if (entry.version <= version) {
			entries.delete(key)
			return
		}
		entry.marks = entry.marks.filter((mark) => mark.version > version)
		if (entry.marks.length === 0) entry.marks.push({ version: entry.version, at: now() })
	}

	function resolveFlushWaiters(result: FlushResult): void {
		const waiters = flushWaiters
		flushWaiters = []
		for (const waiter of waiters) waiter.resolve(result)
	}

	function isFlushed(waiter: FlushWaiter): boolean {
		for (const [key, version] of waiter.targets) {
			if ((acked.get(key) ?? 0) < version) return false
		}
		return true
	}

	function settleFlushWaiters(outcome: SaveOutcome): void {
		if (outcome.kind !== 'ok') {
			resolveFlushWaiters({ ok: false, outcome })
			return
		}
		const waiting: FlushWaiter[] = []
		for (const waiter of flushWaiters) {
			if (isFlushed(waiter)) waiter.resolve({ ok: true })
			else waiting.push(waiter)
		}
		flushWaiters = waiting
	}

	function resolveCloseWaiters(): void {
		const waiters = closeWaiters
		closeWaiters = []
		for (const resolve of waiters) resolve()
	}

	function applyOutcome(key: string, version: number, outcome: SaveOutcome): void {
		const entry = entries.get(key)
		if (outcome.kind === 'ok') {
			acknowledge(key, version)
			clearRetrying()
		} else if (outcome.kind === 'reject') {
			if (entry && entry.version === version) {
				entries.delete(key)
				rejected.add(key)
			}
			clearRetrying()
		} else if (outcome.kind === 'retry') {
			if (entry) entry.due = true
			attempt += 1
			failure = { kind: 'retrying', attempt }
			if (isActive()) retryTimer = setTimer(onRetryTimer, retryDelayFor(attempt))
		} else {
			attempt = 0
			failure = { kind: 'stopped', status: outcome.status }
			clearTimers()
		}
		settleFlushWaiters(outcome)
	}

	function settle(gen: number, key: string, version: number, outcome: SaveOutcome): void {
		if (gen !== generation || disposed) return
		inFlight = null
		applyOutcome(key, version, outcome)
		if (closed) resolveCloseWaiters()
		notify()
		pump()
	}

	function dispatch(key: string, entry: Entry<V>): void {
		entry.due = false
		entry.sentVersion = entry.version
		const version = entry.version
		const gen = generation
		inFlight = { key, version }
		const result = invoke(key, entry.value, false)
		notify()
		void result.then((outcome) => settle(gen, key, version, outcome))
	}

	function pump(): void {
		if (!isActive() || isStopped() || inFlight !== null || retryTimer !== null) return
		for (const [key, entry] of entries) {
			if (!entry.due) continue
			dispatch(key, entry)
			return
		}
	}

	function kick(): void {
		if (!isActive() || isStopped()) return
		clearTimers()
		markDue()
		pump()
	}

	function onDebounce(): void {
		debounceTimer = null
		kick()
	}

	function onMaxWait(): void {
		maxWaitTimer = null
		kick()
	}

	function onRetryTimer(): void {
		retryTimer = null
		kick()
	}

	function settleDrained(gen: number, key: string, version: number, outcome: SaveOutcome): void {
		if (gen !== generation || disposed) return
		if (outcome.kind === 'ok') {
			acknowledge(key, version)
			clearRetrying()
			settleFlushWaiters(outcome)
			notify()
			if (retryTimer !== null) kick()
			return
		}
		const entry = entries.get(key)
		if (entry && entry.version === version && !isSendingLatest(key, entry)) entry.due = true
		pump()
	}

	return {
		set(key, value) {
			if (!isActive()) return
			versionSeq += 1
			const version = versionSeq
			const at = now()
			rejected.delete(key)
			const entry = entries.get(key)
			if (entry) {
				entry.value = value
				entry.version = version
				const last = entry.marks[entry.marks.length - 1]
				if (!last || last.version <= entry.sentVersion) entry.marks.push({ version, at })
			} else {
				entries.set(key, { value, version, due: false, sentVersion: 0, marks: [{ version, at }] })
			}
			if (!isStopped()) {
				debounceTimer = cancel(debounceTimer)
				debounceTimer = setTimer(onDebounce, debounceMs)
				if (maxWaitTimer === null) maxWaitTimer = setTimer(onMaxWait, maxWaitMs)
			}
			notify()
		},
		flush() {
			if (disposed) return Promise.resolve({ ok: false, outcome: RETRY })
			if (closed) return Promise.resolve({ ok: true })
			if (failure?.kind === 'stopped') {
				return Promise.resolve({ ok: false, outcome: { kind: 'stop', status: failure.status } })
			}
			if (entries.size === 0) return Promise.resolve({ ok: true })
			const targets = new Map<string, number>()
			for (const [key, entry] of entries) targets.set(key, entry.version)
			return new Promise<FlushResult>((resolve) => {
				flushWaiters.push({ targets, resolve })
				kick()
			})
		},
		drain({ keepalive }) {
			if (!isActive() || isStopped()) return
			debounceTimer = cancel(debounceTimer)
			maxWaitTimer = cancel(maxWaitTimer)
			const gen = generation
			for (const [key, entry] of entries) {
				if (!keepalive && isSendingLatest(key, entry)) continue
				entry.due = false
				entry.sentVersion = entry.version
				const version = entry.version
				void invoke(key, entry.value, keepalive).then((outcome) => settleDrained(gen, key, version, outcome))
			}
			notify()
		},
		retryNow() {
			if (!isActive() || isStopped()) return
			kick()
		},
		resume() {
			if (!isActive()) return
			if (isStopped()) {
				failure = null
				attempt = 0
				notify()
			}
			kick()
		},
		getState() {
			if (snapshot) return snapshot
			let oldest: number | null = null
			for (const entry of entries.values()) {
				const at = entry.marks[0]?.at
				if (at !== undefined && (oldest === null || at < oldest)) oldest = at
			}
			snapshot = {
				pending: [...entries.keys()],
				rejected: [...rejected],
				inFlight: inFlight?.key ?? null,
				failure,
				oldestPendingSince: oldest,
			}
			return snapshot
		},
		discard() {
			if (disposed) return
			generation += 1
			clearTimers()
			entries.clear()
			rejected.clear()
			acked.clear()
			inFlight = null
			failure = null
			attempt = 0
			resolveFlushWaiters({ ok: true })
			resolveCloseWaiters()
			notify()
		},
		close() {
			if (disposed) return Promise.resolve()
			closed = true
			clearTimers()
			entries.clear()
			resolveFlushWaiters({ ok: true })
			notify()
			if (inFlight === null) return Promise.resolve()
			return new Promise<void>((resolve) => {
				closeWaiters.push(resolve)
			})
		},
		dispose() {
			if (disposed) return
			disposed = true
			clearTimers()
			resolveFlushWaiters({ ok: false, outcome: RETRY })
			resolveCloseWaiters()
		},
	}
}
