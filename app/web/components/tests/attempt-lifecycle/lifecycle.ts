import type {
	AnswerValue,
	AttemptSession,
	AttemptView,
	SaveAttemptDraftRequest,
	SubmitAttemptRequest,
	TelemetryMap,
} from '@bio-exam/exam-core'

import { createSaveQueue, type SaveOutcome, type SaveQueue, type SaveQueueState } from '@/lib/drafts/save-queue'
import type { AttemptDraftSaveResult } from '@/lib/tests/api'

import { classifyStartFailure } from '../attempt-submit-flow'
import type { ClientAttemptStorage } from '../client-attempt-id'
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
import { confirmAnswer, confirmTelemetry, detachWal, readWal, recordAnswer, recordPosition, writeWal } from './wal'

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

type QueueValue = AnswerValue | TelemetryMap

const IDLE_QUEUE: SaveQueueState = {
	pending: [],
	rejected: [],
	inFlight: null,
	failure: null,
	oldestPendingSince: null,
}

const DISABLED_PHASES: ReadonlySet<AttemptPhase> = new Set(['awaitingStart', 'starting', 'blocked'])

export function toSaveOutcome(result: AttemptDraftSaveResult): SaveOutcome {
	if (result.kind !== 'response') return { kind: 'retry' }
	if (result.status >= 200 && result.status < 300) return { kind: 'ok' }
	if (result.status === 400) return { kind: 'reject', status: 400 }
	if (result.status === 403 || result.status === 404) return { kind: 'stop', status: result.status }
	return { kind: 'retry' }
}

export function createAttemptLifecycle(options: AttemptLifecycleOptions): AttemptLifecycle {
	const { testId, userId, questionIds, timeLimitMinutes, storage, api, visibility, onNotice } = options
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

	async function runStart(cached: CachedSession | null): Promise<void> {
		const gen = generation
		let server: AttemptSession
		try {
			server = await api.start(testId)
		} catch (error) {
			if (gen !== generation) return
			if (classifyStartFailure(error) === 'not-assigned') {
				blockStart(cached)
			} else if (cached) {
				session = cached
				phase = 'active'
				enqueuePending()
			} else if (timeLimitMinutes) {
				phase = 'awaitingStart'
				notice({ kind: 'start-failed' })
			} else {
				phase = 'active'
			}
			emit()
			return
		}
		if (gen !== generation) return
		applyServerSession(server, cached)
		phase = 'active'
		enqueuePending()
		emit()
	}

	function onVisibility(event: AttemptVisibilityEvent): void {
		if (!initialized || phase !== 'active' || !queue) return
		if (event === 'hidden') void queue.flush()
		else if (event === 'pagehide') queue.drain({ keepalive: true })
		else queue.retryNow()
	}

	function buildSnapshot(): AttemptSnapshot {
		return {
			phase,
			blockReason,
			alreadySubmittedAttemptId: null,
			submitFailed: false,
			answers,
			currentQuestionId: position,
			startedAt: session?.startedAt ?? null,
			secondsLeft: null,
			result: null,
			showTimeUp: false,
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
			queue = createQueue()
			unsubscribeVisibility = visibility.subscribe(onVisibility)
			const cached = readCachedSession(storage, keys.session)
			session = null
			loadLocal(cached)
			if (cached || !timeLimitMinutes) {
				phase = 'starting'
				void runStart(cached)
			} else {
				phase = 'awaitingStart'
			}
			emit()
		},
		async confirmStart() {
			if (!initialized || phase !== 'awaitingStart') return
			phase = 'starting'
			emit()
			await runStart(null)
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
			position = questionId
			if (initialized && phase === 'active') {
				recordPosition(storage, keys.wal, { sessionId: session?.sessionId ?? null, position })
				void queue?.flush()
			}
			emit()
		},
		async submit() {
			return
		},
		retake() {
			return
		},
		dispose() {
			if (!initialized) return
			initialized = false
			queue?.drain({ keepalive: false })
			queue?.dispose()
			queue = null
			unsubscribeVisibility?.()
			unsubscribeVisibility = null
			clearIndicatorTimer()
			generation += 1
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
