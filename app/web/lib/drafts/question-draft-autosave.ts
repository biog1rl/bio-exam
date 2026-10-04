import { createBeforeUnloadGuard, type BeforeUnloadGuard, type BeforeUnloadWindow } from './before-unload'
import type { LeaveFlushResult } from './draft-ui'
import {
	questionDraftCopyKey,
	readQuestionDraftCopy,
	removeQuestionDraftCopy,
	resolveInitialDraftPayload,
	stableSerialize,
	writeQuestionDraftCopy,
	type QuestionDraftCopy,
	type QuestionDraftCopyStorage,
} from './question-draft-copy'
import { createSaveQueue, type FlushResult, type SaveOutcome, type SaveQueue, type SaveQueueClock } from './save-queue'

export const QUESTION_DRAFT_DEBOUNCE_MS = 700
export const QUESTION_DRAFT_MAX_WAIT_MS = 5000
export const LEAVE_FLUSH_TIMEOUT_MS = 5000
export const AUTOSAVE_SAVING_THRESHOLD_MS = 1500

export type QuestionDraftSaveResult =
	| { kind: 'ok'; lockVersion: number }
	| { kind: 'conflict' }
	| { kind: 'forbidden' }
	| { kind: 'gone' }
	| { kind: 'failed' }

export type QuestionDraftAutosaveApi = {
	save(payload: unknown, lockVersion: number | null, options: { keepalive: boolean }): Promise<QuestionDraftSaveResult>
	readLockVersion(): Promise<number | null>
}

export type QuestionDraftAutosaveSnapshot = {
	status: 'saved' | 'pending' | 'saving' | 'error' | 'closed'
	error: 'failed' | 'conflict' | 'forbidden' | 'gone' | null
	display: 'saved' | 'saving' | 'error' | 'hidden'
	hasUnsavedWrite: boolean
	leaving: boolean
	canRestoreCopy: boolean
}

export type QuestionDraftNotice =
	| 'conflict-resolved'
	| 'conflict-repeated'
	| 'forbidden'
	| 'gone'
	| 'restored'
	| 'copy-diverged'

export type QuestionDraftAutosaveOptions = {
	draftId: string
	userId: string
	serverPayload: unknown
	serverLockVersion: number
	api: QuestionDraftAutosaveApi
	storage: QuestionDraftCopyStorage
	win: BeforeUnloadWindow
	clock?: Partial<SaveQueueClock>
	serialize?: (payload: unknown) => string
	onNotice?: (notice: QuestionDraftNotice) => void
}

export type QuestionDraftAutosave = {
	readonly initialPayload: unknown
	readonly restored: boolean
	start(): void
	change(payload: unknown): void
	restoreDivergedCopy(): unknown | null
	flushForLeave(): Promise<LeaveFlushResult>
	retry(): void
	closeForSave(): Promise<void>
	reopen(): void
	discardCopy(): void
	dispose(): void
	subscribe(listener: () => void): () => void
	getSnapshot(): QuestionDraftAutosaveSnapshot
}

const QUEUE_KEY = 'draft'
const OK: SaveOutcome = { kind: 'ok' }
const RETRY: SaveOutcome = { kind: 'retry' }
const STOP_CONFLICT: SaveOutcome = { kind: 'stop', status: 409 }
const STOP_FORBIDDEN: SaveOutcome = { kind: 'stop', status: 403 }
const STOP_GONE: SaveOutcome = { kind: 'stop', status: 404 }
const FAILED_RESULT: QuestionDraftSaveResult = { kind: 'failed' }
const STOPPED_ERROR: Record<number, QuestionDraftAutosaveSnapshot['error']> = {
	409: 'conflict',
	403: 'forbidden',
	404: 'gone',
}

export function createQuestionDraftAutosave(options: QuestionDraftAutosaveOptions): QuestionDraftAutosave {
	const { api, storage, win, onNotice } = options
	const serialize = options.serialize ?? stableSerialize
	const now = options.clock?.now ?? (() => Date.now())
	const setTimer = options.clock?.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
	const clearTimer =
		options.clock?.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

	const copyKey = questionDraftCopyKey(options.draftId, options.userId)
	const initial = resolveInitialDraftPayload({
		copy: readQuestionDraftCopy(storage, copyKey),
		serverPayload: options.serverPayload,
		serverLockVersion: options.serverLockVersion,
		serialize,
	})
	if (initial.dropCopy) removeQuestionDraftCopy(storage, copyKey)
	const initialPayload = initial.payload
	const restored = initial.restored

	let divergedCopy: unknown | null = initial.divergedCopy
	let restoredUnconfirmed = restored
	let openNoticeSent = false
	let restoreKicked = false
	let forbiddenNoticeSent = false
	let goneNoticeSent = false
	let lockVersion = options.serverLockVersion
	let ackedSerial = serialize(options.serverPayload)
	let latestPayload: unknown = initialPayload
	let latestSerial = serialize(initialPayload)
	let queue: SaveQueue<unknown> | null = null
	let guard: BeforeUnloadGuard | null = null
	let started = false
	let closed = false
	let gone = false
	let forbidden = false
	let leavePromise: Promise<LeaveFlushResult> | null = null
	let leaveTimedOut = false
	let manualRetry = false
	let retryArming = false
	let busySince: number | null = null
	let busyFallback: 'saved' | 'error' = 'saved'
	let busyTimer: unknown = null
	const inflight = new Map<string, Promise<SaveOutcome>>()
	const listeners = new Set<() => void>()

	function computeStatus(): Pick<QuestionDraftAutosaveSnapshot, 'status' | 'error'> {
		if (closed) return { status: 'closed', error: null }
		if (gone) return { status: 'error', error: 'gone' }
		if (forbidden) return { status: 'error', error: 'forbidden' }
		const state = queue?.getState()
		const failure = state?.failure ?? null
		if (failure?.kind === 'stopped') return { status: 'error', error: STOPPED_ERROR[failure.status] ?? 'failed' }
		if (manualRetry && state?.inFlight) return { status: 'saving', error: null }
		if (failure?.kind === 'retrying' || leaveTimedOut) return { status: 'error', error: 'failed' }
		if (state?.inFlight) return { status: 'saving', error: null }
		if (state ? state.pending.length > 0 : latestSerial !== ackedSerial) return { status: 'pending', error: null }
		return { status: 'saved', error: null }
	}

	function computeDisplay(status: QuestionDraftAutosaveSnapshot['status']): QuestionDraftAutosaveSnapshot['display'] {
		if (status === 'closed') return 'hidden'
		if (status === 'error') return 'error'
		if (status === 'saved') return 'saved'
		if (restoredUnconfirmed || manualRetry) return 'saving'
		if (busySince !== null && now() - busySince >= AUTOSAVE_SAVING_THRESHOLD_MS) return 'saving'
		return busyFallback
	}

	function cancelBusyTimer(): void {
		if (busyTimer !== null) clearTimer(busyTimer)
		busyTimer = null
	}

	function trackBusy(status: QuestionDraftAutosaveSnapshot['status'], previous: QuestionDraftAutosaveSnapshot): void {
		const busy = started && (status === 'pending' || status === 'saving')
		if (busy && busySince === null) {
			busySince = now()
			busyFallback = previous.display === 'error' ? 'error' : 'saved'
			cancelBusyTimer()
			busyTimer = setTimer(() => {
				busyTimer = null
				refresh()
			}, AUTOSAVE_SAVING_THRESHOLD_MS)
		} else if (!busy && busySince !== null) {
			busySince = null
			cancelBusyTimer()
		}
	}

	function buildSnapshot(
		status: Pick<QuestionDraftAutosaveSnapshot, 'status' | 'error'>
	): QuestionDraftAutosaveSnapshot {
		return {
			status: status.status,
			error: status.error,
			display: computeDisplay(status.status),
			hasUnsavedWrite:
				status.status === 'pending' ||
				status.status === 'saving' ||
				(status.status === 'error' && status.error !== 'gone'),
			leaving: leavePromise !== null,
			canRestoreCopy: divergedCopy !== null,
		}
	}

	let snapshot: QuestionDraftAutosaveSnapshot = buildSnapshot(computeStatus())

	function refresh(): void {
		if (manualRetry && !retryArming && !queue?.getState().inFlight) manualRetry = false
		const status = computeStatus()
		trackBusy(status.status, snapshot)
		const next = buildSnapshot(status)
		guard?.setActive(next.hasUnsavedWrite)
		const same = (Object.keys(next) as Array<keyof QuestionDraftAutosaveSnapshot>).every(
			(key) => next[key] === snapshot[key]
		)
		if (same) return
		snapshot = next
		for (const listener of [...listeners]) listener()
	}

	function notice(value: QuestionDraftNotice): void {
		if (started) onNotice?.(value)
	}

	function writeCopy(payload: unknown): void {
		const copy: QuestionDraftCopy = { v: 1, payload, baseLockVersion: lockVersion }
		if (forbidden) copy.forbidden = true
		writeQuestionDraftCopy(storage, copyKey, copy)
	}

	function settleCopy(serial: string): void {
		const copy = readQuestionDraftCopy(storage, copyKey)
		if (!copy) return
		const copySerial = serialize(copy.payload)
		if (copySerial === serial) {
			removeQuestionDraftCopy(storage, copyKey)
			return
		}
		if (copySerial === latestSerial && copy.baseLockVersion !== lockVersion) {
			writeQuestionDraftCopy(storage, copyKey, { ...copy, baseLockVersion: lockVersion })
		}
	}

	function acknowledge(serial: string, confirmedLockVersion: number): void {
		lockVersion = Math.max(lockVersion, confirmedLockVersion)
		ackedSerial = serial
		restoredUnconfirmed = false
		settleCopy(serial)
	}

	async function callSave(payload: unknown, version: number | null, keepalive: boolean) {
		try {
			return await api.save(payload, version, { keepalive })
		} catch {
			return FAILED_RESULT
		}
	}

	async function readFreshLockVersion(): Promise<number | null> {
		try {
			const value = await api.readLockVersion()
			return typeof value === 'number' && Number.isFinite(value) ? value : null
		} catch {
			return null
		}
	}

	function applyResult(result: QuestionDraftSaveResult, serial: string): SaveOutcome {
		if (result.kind === 'ok') {
			acknowledge(serial, result.lockVersion)
			return OK
		}
		if (result.kind === 'forbidden') {
			forbidden = true
			writeCopy(latestPayload)
			if (!forbiddenNoticeSent) {
				forbiddenNoticeSent = true
				notice('forbidden')
			}
			return STOP_FORBIDDEN
		}
		if (result.kind === 'gone') {
			gone = true
			removeQuestionDraftCopy(storage, copyKey)
			if (!goneNoticeSent) {
				goneNoticeSent = true
				notice('gone')
			}
			return STOP_GONE
		}
		return RETRY
	}

	async function exchange(payload: unknown, serial: string, keepalive: boolean): Promise<SaveOutcome> {
		const first = await callSave(payload, keepalive ? null : lockVersion, keepalive)
		if (first.kind !== 'conflict' || keepalive) return applyResult(first, serial)
		const fresh = await readFreshLockVersion()
		if (fresh === null) return RETRY
		lockVersion = fresh
		const second = await callSave(payload, lockVersion, false)
		if (second.kind === 'conflict') {
			notice('conflict-repeated')
			return STOP_CONFLICT
		}
		const outcome = applyResult(second, serial)
		if (second.kind === 'ok') notice('conflict-resolved')
		return outcome
	}

	async function save(payload: unknown, serial: string, keepalive: boolean): Promise<SaveOutcome> {
		const outcome = await exchange(payload, serial, keepalive)
		leaveTimedOut = false
		refresh()
		return outcome
	}

	function send(_key: string, payload: unknown, sendOptions: { keepalive: boolean }): Promise<SaveOutcome> {
		if (gone) return Promise.resolve(STOP_GONE)
		if (forbidden) return Promise.resolve(STOP_FORBIDDEN)
		const serial = serialize(payload)
		if (serial === ackedSerial) {
			settleCopy(serial)
			return Promise.resolve(OK)
		}
		if (sendOptions.keepalive) return save(payload, serial, true)
		const running = inflight.get(serial)
		if (running) return running
		const request = save(payload, serial, false)
		inflight.set(serial, request)
		const forget = () => {
			if (inflight.get(serial) === request) inflight.delete(serial)
		}
		void request.then(forget, forget)
		return request
	}

	function createQueue(): SaveQueue<unknown> {
		return createSaveQueue({
			send,
			debounceMs: QUESTION_DRAFT_DEBOUNCE_MS,
			maxWaitMs: QUESTION_DRAFT_MAX_WAIT_MS,
			clock: { now, setTimer, clearTimer },
			onChange: refresh,
		})
	}

	function enqueueUnsaved(target: SaveQueue<unknown>): boolean {
		if (latestSerial === ackedSerial) return false
		target.set(QUEUE_KEY, latestPayload)
		return true
	}

	function onPageHide(): void {
		queue?.drain({ keepalive: true })
	}

	function applyChange(payload: unknown, serial: string): void {
		latestPayload = payload
		latestSerial = serial
		divergedCopy = null
		writeCopy(payload)
		queue?.set(QUEUE_KEY, payload)
		refresh()
	}

	function leaveResult(result: FlushResult): LeaveFlushResult {
		if (result.ok) return { ok: true }
		if (result.outcome.kind === 'stop' && result.outcome.status === 403) return { ok: false, reason: 'forbidden' }
		if (result.outcome.kind === 'stop' && result.outcome.status === 404) return { ok: false, reason: 'gone' }
		return { ok: false, reason: 'failed' }
	}

	return {
		initialPayload,
		restored,
		start() {
			if (started) return
			started = true
			guard = createBeforeUnloadGuard(win)
			win.addEventListener('pagehide', onPageHide)
			if (!openNoticeSent) {
				openNoticeSent = true
				if (restored) notice('restored')
				else if (divergedCopy !== null) notice('copy-diverged')
			}
			if (!closed) {
				const current = createQueue()
				queue = current
				if (enqueueUnsaved(current) && restored && !restoreKicked) {
					restoreKicked = true
					current.retryNow()
				}
			}
			refresh()
		},
		change(payload) {
			if (gone) return
			const serial = serialize(payload)
			if (serial === latestSerial) return
			if (closed) {
				latestPayload = payload
				latestSerial = serial
				return
			}
			applyChange(payload, serial)
		},
		restoreDivergedCopy() {
			if (divergedCopy === null || closed || gone) return null
			const payload = divergedCopy
			applyChange(payload, serialize(payload))
			return payload
		},
		flushForLeave() {
			if (leavePromise) return leavePromise
			if (gone) return Promise.resolve({ ok: false, reason: 'gone' })
			refresh()
			if (!snapshot.hasUnsavedWrite) return Promise.resolve({ ok: true })
			if (forbidden) return Promise.resolve({ ok: false, reason: 'forbidden' })
			const current = queue
			if (!current) return Promise.resolve({ ok: false, reason: 'failed' })
			const promise = new Promise<LeaveFlushResult>((resolve) => {
				let done = false
				let timer: unknown = null
				const finish = (result: LeaveFlushResult) => {
					if (done) return
					done = true
					if (timer !== null) clearTimer(timer)
					if (leavePromise === promise) leavePromise = null
					refresh()
					resolve(result)
				}
				timer = setTimer(() => {
					timer = null
					leaveTimedOut = true
					finish({ ok: false, reason: 'failed' })
				}, LEAVE_FLUSH_TIMEOUT_MS)
				void current.flush().then((result) => finish(leaveResult(result)))
			})
			leavePromise = promise
			refresh()
			return promise
		},
		retry() {
			const current = queue
			if (!current || closed || gone || forbidden) return
			const failure = current.getState().failure
			if (failure?.kind === 'stopped' && failure.status !== 409) return
			manualRetry = true
			retryArming = true
			try {
				if (failure?.kind === 'stopped') current.resume()
				else current.retryNow()
			} finally {
				retryArming = false
			}
			refresh()
		},
		async closeForSave() {
			if (closed) return
			closed = true
			const current = queue
			refresh()
			if (current) await current.close()
			refresh()
		},
		reopen() {
			if (!closed) return
			closed = false
			if (started) {
				const current = createQueue()
				queue = current
				enqueueUnsaved(current)
			}
			refresh()
		},
		discardCopy() {
			removeQuestionDraftCopy(storage, copyKey)
		},
		dispose() {
			if (!started) return
			started = false
			const current = queue
			queue = null
			if (current) {
				current.drain({ keepalive: false })
				current.dispose()
			}
			win.removeEventListener('pagehide', onPageHide)
			guard?.dispose()
			guard = null
			cancelBusyTimer()
			busySince = null
			refresh()
		},
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		getSnapshot() {
			return snapshot
		},
	}
}
