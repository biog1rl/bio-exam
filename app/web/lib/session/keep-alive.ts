import type { RefreshOutcome } from './client'
import { refreshDelayMs } from './schedule'

export const REFRESH_RETRY_MS = 30_000

const MAX_TIMER_MS = 2_147_483_647

export type KeepAliveDocument = {
	readonly visibilityState: string
	addEventListener(type: 'visibilitychange', listener: () => void): void
	removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export type KeepAliveOptions = {
	refresh: () => Promise<RefreshOutcome>
	onRefreshed: (accessExpiresAt: string | null) => void
	onSessionEnded: () => void
	doc: KeepAliveDocument
	now?: () => number
	setTimer?: (callback: () => void, ms: number) => unknown
	clearTimer?: (handle: unknown) => void
}

export type KeepAlive = {
	update(accessExpiresAt: string | null): void
	stop(): void
}

export function createKeepAlive({
	refresh,
	onRefreshed,
	onSessionEnded,
	doc,
	now = () => Date.now(),
	setTimer = (callback, ms) => setTimeout(callback, ms),
	clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: KeepAliveOptions): KeepAlive {
	let dueAt: number | null = null
	let timer: unknown = null
	let inFlight = false
	let stopped = false

	function clear(): void {
		if (timer === null) return
		clearTimer(timer)
		timer = null
	}

	function arm(): void {
		clear()
		if (dueAt === null) return
		timer = setTimer(fire, Math.min(Math.max(0, dueAt - now()), MAX_TIMER_MS))
	}

	function scheduleIn(delayMs: number | null): void {
		dueAt = delayMs === null ? null : now() + delayMs
		arm()
	}

	function isVisible(): boolean {
		return doc.visibilityState === 'visible'
	}

	function fire(): void {
		timer = null
		if (dueAt === null) return
		if (now() < dueAt) {
			arm()
			return
		}
		if (isVisible()) void run()
	}

	async function run(): Promise<void> {
		if (inFlight || stopped) return
		inFlight = true
		clear()
		dueAt = null
		let outcome: RefreshOutcome
		try {
			outcome = await refresh()
		} catch {
			outcome = { kind: 'unavailable' }
		}
		inFlight = false
		if (stopped) return
		if (outcome.kind === 'ok') {
			scheduleIn(refreshDelayMs(outcome.accessExpiresAt, now()))
			onRefreshed(outcome.accessExpiresAt)
			return
		}
		if (outcome.kind === 'rejected') {
			onSessionEnded()
			return
		}
		scheduleIn(REFRESH_RETRY_MS)
	}

	function onVisibilityChange(): void {
		if (stopped || inFlight || dueAt === null || !isVisible()) return
		if (now() >= dueAt) {
			void run()
			return
		}
		if (timer === null) arm()
	}

	doc.addEventListener('visibilitychange', onVisibilityChange)

	return {
		update(accessExpiresAt) {
			if (stopped) return
			scheduleIn(refreshDelayMs(accessExpiresAt, now()))
		},
		stop() {
			stopped = true
			clear()
			dueAt = null
			doc.removeEventListener('visibilitychange', onVisibilityChange)
		},
	}
}
