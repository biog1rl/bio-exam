import {
	ATTEMPT_GRACE_PERIOD_MINUTES,
	type AnswerValue,
	type AttemptSession,
	type AttemptView,
	type SaveAttemptDraftRequest,
	type SubmitAttemptRequest,
	type TelemetryMap,
} from '@bio-exam/exam-core'

import { createSaveQueue, type SaveOutcome, type SaveQueue, type SaveQueueState } from '@/lib/drafts/save-queue'
import type { AttemptDraftSaveResult } from '@/lib/tests/api'

import { classifyStartFailure, classifySubmitFailure, type SubmitFailure } from '../attempt-submit-flow'
import { resolveClientAttemptId, storedClientAttemptId, type ClientAttemptStorage } from '../client-attempt-id'
import { appendQuestionTime, incrementQuestionFocusLoss, incrementQuestionVisit } from '../telemetry'
import { resolveRestoredDraft, type RestoredDraft } from './restore'
import { saveIndicatorDueAt, saveIndicatorKind, type SaveIndicatorInput } from './save-indicator'
import {
	attemptStorageKeys,
	clearAttemptKeys,
	readCachedSession,
	safeRemove,
	writeCachedSession,
	type CachedSession,
} from './storage-keys'
import {
	confirmAnswer,
	confirmTelemetry,
	detachWal,
	readWal,
	recordAnswer,
	recordPosition,
	updateWal,
	writeWal,
} from './wal'

export type AttemptPhase =
	| 'awaitingStart'
	| 'starting'
	| 'active'
	| 'submitting'
	| 'autoSubmitting'
	| 'submitted'
	| 'blocked'
export type AttemptBlockReason =
	| 'start-not-assigned'
	| 'submit-not-assigned'
	| 'not-found'
	| 'already-submitted'
	| 'time-expired'
export type SaveIndicatorKind = 'saved' | 'saving' | 'offline' | 'device-only'
export type AttemptNotice =
	| { kind: 'session-restored' }
	| { kind: 'session-replaced' }
	| { kind: 'start-failed' }
	| { kind: 'retake-start-failed' }
	| { kind: 'one-minute-left' }
	| { kind: 'submitted'; result: AttemptView }
export type AttemptSnapshot = {
	phase: AttemptPhase
	blockReason: AttemptBlockReason | null
	alreadySubmittedAttemptId: string | null
	submitFailed: boolean
	answers: Readonly<Record<string, AnswerValue>>
	currentQuestionId: string | null
	startedAt: string | null
	secondsLeft: number | null
	result: AttemptView | null
	showTimeUp: boolean
	saveIndicator: SaveIndicatorKind | null
	interactionDisabled: boolean
}
export type AttemptLifecycleApi = {
	start(testId: string): Promise<AttemptSession>
	saveDraft(
		testId: string,
		sessionId: string,
		body: SaveAttemptDraftRequest,
		options: { keepalive: boolean }
	): Promise<AttemptDraftSaveResult>
	submit(testId: string, request: SubmitAttemptRequest): Promise<AttemptView>
}
export type AttemptVisibilityEvent = 'hidden' | 'visible' | 'pagehide' | 'online'
export type AttemptVisibility = {
	isHidden(): boolean
	subscribe(listener: (event: AttemptVisibilityEvent) => void): () => void
}
export type AttemptClock = {
	now(): number
	setTimer(callback: () => void, ms: number): unknown
	clearTimer(handle: unknown): void
}
export type AttemptLifecycleOptions = {
	testId: string
	userId: string
	questionIds: readonly string[]
	timeLimitMinutes: number | null
	storage: ClientAttemptStorage
	api: AttemptLifecycleApi
	visibility: AttemptVisibility
	clock?: Partial<AttemptClock>
	createId?: () => string
	onNotice?: (notice: AttemptNotice) => void
}
export type AttemptLifecycle = {
	init(): void
	confirmStart(): Promise<void>
	answer(questionId: string, value: AnswerValue): void
	navigate(questionId: string): void
	submit(options?: { auto?: boolean }): Promise<void>
	retake(): void
	dispose(): void
	subscribe(listener: () => void): () => void
	getSnapshot(): AttemptSnapshot
}

export const ATTEMPT_SAVE_DEBOUNCE_MS = 600
export const ATTEMPT_SAVE_MAX_WAIT_MS = 5000
export const TELEMETRY_QUEUE_KEY = '#telemetry'
export const TIME_UP_PAUSE_MS = 1500
export const ONE_MINUTE_LEFT_SECONDS = 60

type QueueValue = AnswerValue | TelemetryMap

const IDLE_QUEUE: SaveQueueState = {
	pending: [],
	rejected: [],
	inFlight: null,
	failure: null,
	oldestPendingSince: null,
}

const DISABLED_PHASES: ReadonlySet<AttemptPhase> = new Set([
	'awaitingStart',
	'starting',
	'submitting',
	'autoSubmitting',
	'submitted',
	'blocked',
])

export function toSaveOutcome(result: AttemptDraftSaveResult): SaveOutcome {
	if (result.kind !== 'response') return { kind: 'retry' }
	if (result.status >= 200 && result.status < 300) return { kind: 'ok' }
	if (result.status === 400) return { kind: 'reject', status: 400 }
	if (result.status === 403 || result.status === 404) return { kind: 'stop', status: result.status }
	return { kind: 'retry' }
}

export function createAttemptLifecycle(options: AttemptLifecycleOptions): AttemptLifecycle {
	const { testId, userId, questionIds, timeLimitMinutes, storage, api, visibility, onNotice, createId } = options
	const {
		now = () => Date.now(),
		setTimer = (callback: () => void, ms: number) => setTimeout(callback, ms),
		clearTimer = (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
	}: Partial<AttemptClock> = options.clock ?? {}
	const clock: AttemptClock = { now, setTimer, clearTimer }
	const keys = attemptStorageKeys(testId, userId)
	const knownQuestions = new Set(questionIds)
	const listeners = new Set<() => void>()

	let initialized = false
	let generation = 0
	let phase: AttemptPhase = 'starting'
	let blockReason: AttemptBlockReason | null = null
	let session: CachedSession | null = null
	let answers: Record<string, AnswerValue> = {}
	let pending = new Set<string>()
	let position: string | null = questionIds[0] ?? null
	let telemetry: TelemetryMap = {}
	let telemetryPending = false
	let queue: SaveQueue<QueueValue> | null = null
	let unsubscribeVisibility: (() => void) | null = null
	let snapshot: AttemptSnapshot | null = null
	let indicatorTimer: unknown = null
	let submitFailed = false
	let alreadySubmittedAttemptId: string | null = null
	let result: AttemptView | null = null
	let showTimeUp = false
	let timeUpPause: { handle: unknown; resolve: () => void } | null = null
	let restoreCandidate: CachedSession | null = null
	let closedSession: CachedSession | null = null
	let segmentStartedAt: number | null = null
	let tickTimer: unknown = null
	let warned = false
	let autoFired = false

	function indicatorInput(): SaveIndicatorInput {
		return {
			phase,
			queue: queue?.getState() ?? IDLE_QUEUE,
			now: clock.now(),
			hasSession: session !== null,
			walPendingCount: pending.size,
		}
	}

	function clearIndicatorTimer(): void {
		if (indicatorTimer === null) return
		clock.clearTimer(indicatorTimer)
		indicatorTimer = null
	}

	function scheduleIndicator(): void {
		clearIndicatorTimer()
		if (!initialized) return
		const input = indicatorInput()
		const dueAt = saveIndicatorDueAt(input)
		if (dueAt === null) return
		indicatorTimer = clock.setTimer(() => {
			indicatorTimer = null
			emit()
		}, dueAt - input.now)
	}

	function emit(): void {
		snapshot = null
		scheduleIndicator()
		for (const listener of [...listeners]) listener()
	}

	function notice(value: AttemptNotice): void {
		onNotice?.(value)
	}

	async function send(key: string, value: QueueValue, sendOptions: { keepalive: boolean }): Promise<SaveOutcome> {
		const gen = generation
		const current = session
		if (!current) return { kind: 'retry' }
		const body: SaveAttemptDraftRequest =
			key === TELEMETRY_QUEUE_KEY
				? { telemetry: value as TelemetryMap }
				: { questionId: key, value: value as AnswerValue }
		const result = await api.saveDraft(testId, current.sessionId, body, sendOptions)
		const outcome = toSaveOutcome(result)
		if (outcome.kind === 'ok' && gen === generation && session?.sessionId === current.sessionId) {
			confirm(key, value, current.sessionId)
		}
		return outcome
	}

	function confirm(key: string, value: QueueValue, sessionId: string): void {
		if (key === TELEMETRY_QUEUE_KEY) {
			if (telemetry !== value) return
			telemetryPending = false
			confirmTelemetry(storage, keys.wal, { sessionId, telemetry })
		} else {
			if (answers[key] !== value) return
			pending.delete(key)
			confirmAnswer(storage, keys.wal, { sessionId, questionId: key, value: value as AnswerValue })
		}
		snapshot = null
	}

	function createQueue(): SaveQueue<QueueValue> {
		return createSaveQueue<QueueValue>({
			send,
			debounceMs: ATTEMPT_SAVE_DEBOUNCE_MS,
			maxWaitMs: ATTEMPT_SAVE_MAX_WAIT_MS,
			clock,
			onChange: emit,
		})
	}

	function enqueuePending(): void {
		if (!queue || !session) return
		for (const questionId of pending) {
			const value = answers[questionId]
			if (value !== undefined) queue.set(questionId, value)
		}
		if (telemetryPending) queue.set(TELEMETRY_QUEUE_KEY, telemetry)
	}

	function applyTelemetry(next: TelemetryMap): void {
		if (next === telemetry) return
		telemetry = next
		telemetryPending = true
		updateWal(storage, keys.wal, session?.sessionId ?? null, (record) => ({
			...record,
			telemetry: next,
			telemetryPending: true,
		}))
		snapshot = null
	}

	function queueTelemetry(): void {
		if (session && telemetryPending) queue?.set(TELEMETRY_QUEUE_KEY, telemetry)
	}

	function openSegment(): void {
		if (phase !== 'active' || segmentStartedAt !== null || position === null || visibility.isHidden()) return
		segmentStartedAt = clock.now()
	}

	function closeSegment(): void {
		if (segmentStartedAt === null) return
		const elapsed = clock.now() - segmentStartedAt
		segmentStartedAt = null
		if (position !== null) applyTelemetry(appendQuestionTime(telemetry, position, elapsed))
	}

	function deadlineMs(): number | null {
		if (!timeLimitMinutes || !session) return null
		const startedMs = Date.parse(session.startedAt)
		if (Number.isNaN(startedMs)) return null
		return startedMs + timeLimitMinutes * 60_000
	}

	function secondsLeft(): number | null {
		const deadline = deadlineMs()
		if (deadline === null) return null
		return Math.max(0, Math.floor((deadline - clock.now()) / 1000))
	}

	function stopTick(): void {
		if (tickTimer === null) return
		clock.clearTimer(tickTimer)
		tickTimer = null
	}

	function scheduleTick(): void {
		stopTick()
		const deadline = deadlineMs()
		if (!initialized || phase !== 'active' || deadline === null) return
		const remaining = deadline - clock.now()
		const delay = remaining > 0 ? remaining % 1000 || 1000 : 0
		tickTimer = clock.setTimer(onTick, delay)
	}

	function onTick(): void {
		tickTimer = null
		if (!initialized || phase !== 'active') return
		const left = secondsLeft()
		if (left === null) return
		if (left <= 0) {
			warned = true
			if (autoFired) {
				emit()
				return
			}
			void runSubmit(true)
			return
		}
		if (left <= ONE_MINUTE_LEFT_SECONDS && !warned) {
			warned = true
			notice({ kind: 'one-minute-left' })
		}
		scheduleTick()
		emit()
	}

	function enterActive(visit: boolean): void {
		phase = 'active'
		if (visit && position !== null) applyTelemetry(incrementQuestionVisit(telemetry, position))
		openSegment()
		scheduleTick()
	}

	function leaveActive(): void {
		closeSegment()
		stopTick()
	}

	function applyRestored(restored: RestoredDraft): void {
		answers = restored.answers
		pending = new Set(restored.pending)
		position = restored.position
		telemetry = restored.telemetry
		telemetryPending = restored.telemetryPending
	}

	function loadLocal(cached: CachedSession | null): void {
		const cachedSessionId = cached?.sessionId ?? null
		applyRestored(
			resolveRestoredDraft({
				server: null,
				wal: readWal(storage, keys.wal, cachedSessionId),
				cachedSessionId,
				questionIds,
			})
		)
	}

	function persistAll(sessionId: string | null): void {
		writeWal(storage, keys.wal, {
			v: 2,
			sessionId,
			answers,
			pending: [...pending],
			position,
			telemetry,
			telemetryPending,
		})
	}

	function applyServerSession(server: AttemptSession, cached: CachedSession | null): void {
		const cachedSessionId = cached?.sessionId ?? null
		if (cached && cached.sessionId !== server.sessionId) {
			clearAttemptKeys(storage, keys, 'session-replaced')
			notice({ kind: 'session-replaced' })
		} else if (cached) {
			notice({ kind: 'session-restored' })
		}
		let wal = readWal(storage, keys.wal, cachedSessionId)
		if (wal && wal.sessionId !== null && wal.sessionId !== server.sessionId) {
			safeRemove(storage, keys.wal)
			wal = null
		}
		applyRestored(resolveRestoredDraft({ server, wal, cachedSessionId, questionIds }))
		session = { sessionId: server.sessionId, startedAt: server.startedAt }
		writeCachedSession(storage, keys.session, session)
		persistAll(server.sessionId)
	}

	function blockStart(cached: CachedSession | null): void {
		const cachedSessionId = cached?.sessionId ?? null
		clearAttemptKeys(storage, keys, 'start-not-assigned')
		const wal = readWal(storage, keys.wal, cachedSessionId)
		if (wal && (wal.sessionId === null || wal.sessionId === cachedSessionId)) {
			detachWal(storage, keys.wal, cachedSessionId)
		}
		session = null
		pending = new Set(Object.keys(answers))
		queue?.discard()
		phase = 'blocked'
		blockReason = 'start-not-assigned'
	}

	type StartMode = { retake?: boolean; candidate?: boolean; frozen?: boolean }

	async function runStart(cached: CachedSession | null, mode: StartMode = {}): Promise<void> {
		const gen = generation
		let server: AttemptSession
		try {
			server = await api.start(testId)
		} catch (error) {
			if (gen !== generation) return
			if (classifyStartFailure(error) === 'not-assigned') {
				if (mode.candidate) restoreCandidate = null
				blockStart(cached)
			} else if (cached && !mode.candidate) {
				session = cached
				enqueuePending()
				enterActive(true)
			} else if (timeLimitMinutes) {
				phase = 'awaitingStart'
				notice({ kind: 'start-failed' })
			} else {
				enterActive(true)
				if (mode.retake) notice({ kind: 'retake-start-failed' })
			}
			emit()
			return
		}
		if (gen !== generation) return
		if (mode.candidate) restoreCandidate = null
		const known = mode.candidate && cached?.sessionId !== server.sessionId ? null : cached
		applyServerSession(server, known)
		if (mode.frozen) {
			if (session && known && session.sessionId === known.sessionId) {
				await resubmit(session, true)
				return
			}
			removeFrozen()
		}
		enqueuePending()
		enterActive(true)
		emit()
	}

	async function resubmit(current: CachedSession, auto: boolean): Promise<void> {
		const gen = generation
		beginSubmit(auto)
		const outcome = await sendSubmit(current, auto)
		if (outcome !== 'retry' || gen !== generation) return
		phase = 'starting'
		emit()
		await runStart(current)
	}

	function isAbandonedExpired(cached: CachedSession): boolean {
		if (!timeLimitMinutes) return false
		const startedMs = Date.parse(cached.startedAt)
		if (Number.isNaN(startedMs)) return false
		return clock.now() > startedMs + (timeLimitMinutes + ATTEMPT_GRACE_PERIOD_MINUTES) * 60_000
	}

	function clearDraftState(): void {
		answers = {}
		pending = new Set()
		position = questionIds[0] ?? null
		telemetry = {}
		telemetryPending = false
	}

	function hasFrozen(): boolean {
		try {
			return storage.getItem(keys.frozen) !== null
		} catch {
			return false
		}
	}

	function writeFrozen(): void {
		try {
			storage.setItem(keys.frozen, '1')
		} catch {
			return
		}
	}

	function removeFrozen(): void {
		safeRemove(storage, keys.frozen)
	}

	function pauseTimeUp(): Promise<void> {
		return new Promise((resolve) => {
			const handle = clock.setTimer(() => {
				timeUpPause = null
				resolve()
			}, TIME_UP_PAUSE_MS)
			timeUpPause = { handle, resolve }
		})
	}

	function cancelTimeUpPause(): void {
		if (!timeUpPause) return
		const { handle, resolve } = timeUpPause
		timeUpPause = null
		clock.clearTimer(handle)
		resolve()
	}

	function beginSubmit(auto: boolean): void {
		leaveActive()
		if (auto) autoFired = true
		submitFailed = false
		if (auto) writeFrozen()
		phase = auto ? 'autoSubmitting' : 'submitting'
		emit()
	}

	function failSubmit(auto: boolean): void {
		if (auto) removeFrozen()
		enterActive(false)
		submitFailed = true
	}

	async function startForSubmit(auto: boolean): Promise<CachedSession | null> {
		const gen = generation
		let server: AttemptSession
		try {
			server = await api.start(testId)
		} catch (error) {
			if (gen !== generation) return null
			if (classifyStartFailure(error) === 'not-assigned') {
				if (auto) removeFrozen()
				blockStart(null)
			} else {
				failSubmit(auto)
			}
			emit()
			return null
		}
		if (gen !== generation) return null
		session = { sessionId: server.sessionId, startedAt: server.startedAt }
		writeCachedSession(storage, keys.session, session)
		persistAll(session.sessionId)
		return session
	}

	async function sendSubmit(current: CachedSession, auto: boolean): Promise<'settled' | 'retry' | 'stale'> {
		const gen = generation
		const clientAttemptId = resolveClientAttemptId(storage, keys.clientAttemptId, current.sessionId, createId)
		let view: AttemptView
		try {
			view = await api.submit(testId, { sessionId: current.sessionId, clientAttemptId, answers, telemetry })
		} catch (error) {
			if (gen !== generation) return 'stale'
			return applySubmitFailure(classifySubmitFailure(error), current, auto)
		}
		if (gen !== generation) return 'stale'
		queue?.discard()
		clearAttemptKeys(storage, keys, 'success')
		closedSession = current
		session = null
		pending = new Set()
		telemetryPending = false
		if (auto) {
			showTimeUp = true
			emit()
			await pauseTimeUp()
			if (gen !== generation) return 'stale'
			showTimeUp = false
		}
		result = view
		phase = 'submitted'
		emit()
		notice({ kind: 'submitted', result: view })
		return 'settled'
	}

	function applySubmitFailure(failure: SubmitFailure, current: CachedSession, auto: boolean): 'settled' | 'retry' {
		if (failure.kind === 'retry') {
			if (auto) removeFrozen()
			return 'retry'
		}
		if (failure.kind === 'already-submitted' || failure.kind === 'time-expired') {
			queue?.discard()
			clearAttemptKeys(storage, keys, failure.kind)
			closedSession = current
			session = null
			pending = new Set()
			telemetryPending = false
			alreadySubmittedAttemptId = failure.kind === 'already-submitted' ? failure.attemptId : null
		} else if (failure.kind === 'not-found') {
			if (auto) removeFrozen()
			clearAttemptKeys(storage, keys, 'not-found')
			const wal = readWal(storage, keys.wal, current.sessionId)
			if (wal && (wal.sessionId === null || wal.sessionId === current.sessionId)) {
				detachWal(storage, keys.wal, current.sessionId)
			}
			queue?.discard()
			session = null
			pending = new Set(Object.keys(answers))
			telemetryPending = Object.keys(telemetry).length > 0
		} else {
			if (auto) removeFrozen()
			clearAttemptKeys(storage, keys, 'submit-not-assigned')
		}
		phase = 'blocked'
		blockReason = failure.kind === 'not-assigned' ? 'submit-not-assigned' : failure.kind
		emit()
		return 'settled'
	}

	function reset(): void {
		restoreCandidate = session ?? closedSession
		closedSession = null
		generation += 1
		queue?.discard()
		cancelTimeUpPause()
		clearIndicatorTimer()
		stopTick()
		segmentStartedAt = null
		warned = false
		autoFired = false
		clearAttemptKeys(storage, keys, 'success')
		session = null
		blockReason = null
		alreadySubmittedAttemptId = null
		submitFailed = false
		result = null
		showTimeUp = false
		clearDraftState()
		if (timeLimitMinutes) {
			phase = 'awaitingStart'
			emit()
			return
		}
		phase = 'starting'
		emit()
		void runStart(restoreCandidate, { retake: true, candidate: true })
	}

	async function runSubmit(auto: boolean): Promise<void> {
		const gen = generation
		beginSubmit(auto)
		const current = session ?? (await startForSubmit(auto))
		if (!current || gen !== generation) return
		const outcome = await sendSubmit(current, auto)
		if (outcome !== 'retry') return
		failSubmit(auto)
		emit()
	}

	function onVisibility(event: AttemptVisibilityEvent): void {
		if (!initialized || phase !== 'active' || !queue) return
		if (event === 'hidden') {
			closeSegment()
			if (position !== null) applyTelemetry(incrementQuestionFocusLoss(telemetry, position))
			queueTelemetry()
			void queue.flush()
		} else if (event === 'pagehide') {
			closeSegment()
			queueTelemetry()
			queue.drain({ keepalive: true })
		} else {
			if (event === 'visible') openSegment()
			queue.retryNow()
		}
	}

	function buildSnapshot(): AttemptSnapshot {
		return {
			phase,
			blockReason,
			alreadySubmittedAttemptId,
			submitFailed,
			answers,
			currentQuestionId: position,
			startedAt: session?.startedAt ?? null,
			secondsLeft: secondsLeft(),
			result,
			showTimeUp,
			saveIndicator: saveIndicatorKind(indicatorInput()),
			interactionDisabled: DISABLED_PHASES.has(phase),
		}
	}

	return {
		init() {
			if (initialized) return
			initialized = true
			generation += 1
			blockReason = null
			alreadySubmittedAttemptId = null
			submitFailed = false
			result = null
			showTimeUp = false
			segmentStartedAt = null
			warned = false
			autoFired = false
			queue = createQueue()
			unsubscribeVisibility = visibility.subscribe(onVisibility)
			const cached = readCachedSession(storage, keys.session)
			const frozen = hasFrozen()
			session = null
			if (!cached) {
				if (frozen) removeFrozen()
				loadLocal(null)
				phase = timeLimitMinutes ? 'awaitingStart' : 'starting'
				emit()
				if (!timeLimitMinutes) void runStart(null)
				return
			}
			if (storedClientAttemptId(storage, keys.clientAttemptId, cached.sessionId) !== null) {
				loadLocal(cached)
				session = cached
				void resubmit(cached, frozen)
				return
			}
			if (isAbandonedExpired(cached)) {
				removeFrozen()
				restoreCandidate = cached
				clearDraftState()
				phase = 'awaitingStart'
				emit()
				return
			}
			loadLocal(cached)
			phase = 'starting'
			emit()
			void runStart(cached, { frozen })
		},
		async confirmStart() {
			if (!initialized || phase !== 'awaitingStart') return
			phase = 'starting'
			emit()
			await runStart(restoreCandidate, { candidate: true })
		},
		answer(questionId, value) {
			if (!initialized || phase !== 'active' || !knownQuestions.has(questionId)) return
			answers = { ...answers, [questionId]: value }
			pending.add(questionId)
			recordAnswer(storage, keys.wal, { sessionId: session?.sessionId ?? null, questionId, value, position })
			if (session) queue?.set(questionId, value)
			emit()
		},
		navigate(questionId) {
			if (!knownQuestions.has(questionId)) return
			if (!initialized || phase !== 'active') {
				position = questionId
				emit()
				return
			}
			if (questionId !== position) {
				closeSegment()
				position = questionId
				applyTelemetry(incrementQuestionVisit(telemetry, questionId))
				openSegment()
			}
			recordPosition(storage, keys.wal, { sessionId: session?.sessionId ?? null, position })
			queueTelemetry()
			void queue?.flush()
			emit()
		},
		async submit(submitOptions) {
			if (!initialized || phase !== 'active') return
			await runSubmit(submitOptions?.auto === true)
		},
		retake() {
			if (!initialized) return
			reset()
		},
		dispose() {
			if (!initialized) return
			closeSegment()
			queueTelemetry()
			initialized = false
			queue?.drain({ keepalive: false })
			queue?.dispose()
			queue = null
			unsubscribeVisibility?.()
			unsubscribeVisibility = null
			clearIndicatorTimer()
			stopTick()
			generation += 1
			cancelTimeUpPause()
		},
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		getSnapshot() {
			if (!snapshot) snapshot = buildSnapshot()
			return snapshot
		},
	}
}
