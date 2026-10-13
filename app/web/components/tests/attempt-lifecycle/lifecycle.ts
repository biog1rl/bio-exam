import {
	ATTEMPT_GRACE_PERIOD_MINUTES,
	type AnswerValue,
	type AttemptSession,
	type AttemptView,
	type SaveAttemptDraftRequest,
	type SessionFate,
	type SubmitAttemptRequest,
	type TelemetryMap,
} from '@bio-exam/exam-core'

import {
	createSaveQueue,
	SAVE_RETRY_DELAYS_MS,
	type SaveOutcome,
	type SaveQueue,
	type SaveQueueState,
} from '@/lib/drafts/save-queue'
import type { AttemptDraftSaveResult } from '@/lib/tests/api'

import {
	classifyStartFailure,
	classifySubmitFailure,
	type SubmitFailure,
	type SubmitRejection,
} from '../attempt-submit-flow'
import { resolveClientAttemptId, storedClientAttemptId, type ClientAttemptStorage } from '../client-attempt-id'
import { appendQuestionTime, incrementQuestionFocusLoss, incrementQuestionVisit } from '../telemetry'
import { attemptDisplay, saveOutcomeOf, type AttemptDisplay } from './outcome-rules'
import { resolveRestoredDraft, type RestoredDraft } from './restore'
import { saveIndicatorDueAt, saveIndicatorKind, type SaveIndicatorInput } from './save-indicator'
import { createServerClock } from './server-clock'
import {
	applyStorageEffects,
	attemptStorageKeys,
	readCachedSession,
	readUnsent,
	writeCachedSession,
	writeUnsent,
	type CachedSession,
} from './storage-keys'
import {
	confirmAnswer,
	confirmTelemetry,
	readWal,
	recordAnswer,
	recordPosition,
	updateWal,
	writeWal,
	type WalRecord,
} from './wal'
import { unsentTexts, type UnsentEntry, type UnsentRecord } from './wal-reconcile'

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
export type AttemptUnsent = { certain: boolean; entries: readonly UnsentEntry[] }
export type AttemptSnapshot = {
	phase: AttemptPhase
	blockReason: AttemptBlockReason | null
	alreadySubmittedAttemptId: string | null
	submitFailed: boolean
	submitRejection: SubmitRejection | null
	answers: Readonly<Record<string, AnswerValue>>
	currentQuestionId: string | null
	startedAt: string | null
	secondsLeft: number | null
	result: AttemptView | null
	showTimeUp: boolean
	saveIndicator: SaveIndicatorKind | null
	interactionDisabled: boolean
	deadlinePassed: boolean
	acceptedAutomatically: boolean
	uploadClosesAt: string | null
	serverOffsetMs: number
	unsent: AttemptUnsent | null
	display: AttemptDisplay
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
	readSession?: (testId: string, sessionId: string) => Promise<SessionFate>
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
	textQuestionIds?: readonly string[]
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
	setQuestionIds(questionIds: readonly string[], textQuestionIds?: readonly string[]): void
	submit(options?: { auto?: boolean }): Promise<void>
	retake(): void
	dismissAlreadySubmitted(): void
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
type AcceptedOutcome = {
	attemptId: string | null
	attempt: AttemptView | null
	uploadClosesAt: string | null
	serverNow: string | null
}
type ReadSession = NonNullable<AttemptLifecycleApi['readSession']>

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

export function createAttemptLifecycle(options: AttemptLifecycleOptions): AttemptLifecycle {
	const { testId, userId, timeLimitMinutes, storage, api, visibility, onNotice, createId } = options
	const {
		now = () => Date.now(),
		setTimer = (callback: () => void, ms: number) => setTimeout(callback, ms),
		clearTimer = (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
	}: Partial<AttemptClock> = options.clock ?? {}
	const clock: AttemptClock = { now, setTimer, clearTimer }
	const serverClock = createServerClock(clock.now)
	const keys = attemptStorageKeys(testId, userId)
	let questionIds: readonly string[] = [...options.questionIds]
	let knownQuestions = new Set(questionIds)
	let textQuestionIds: ReadonlySet<string> = new Set(options.textQuestionIds ?? [])
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
	let submitRejection: SubmitRejection | null = null
	let alreadySubmittedAttemptId: string | null = null
	let alreadySubmittedDismissed = false
	let result: AttemptView | null = null
	let acceptedAutomatically = false
	let uploadClosesAt: string | null = null
	let unsent: AttemptUnsent | null = null
	let showTimeUp = false
	let timeUpPause: { handle: unknown; resolve: () => void } | null = null
	let restoreCandidate: CachedSession | null = null
	let closedSession: CachedSession | null = null
	let segmentStartedAt: number | null = null
	let tickTimer: unknown = null
	let warned = false
	let autoFired = false
	let deadlinePassed = false
	let startRetryTimer: unknown = null
	let startRetryCount = 0
	let startRetryInFlight = false

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

	async function send(
		key: string,
		value: QueueValue,
		{ keepalive, provisional = false }: { keepalive: boolean; provisional?: boolean }
	): Promise<SaveOutcome> {
		const gen = generation
		const current = session
		if (!current) return { kind: 'retry' }
		const body: SaveAttemptDraftRequest =
			key === TELEMETRY_QUEUE_KEY
				? { telemetry: value as TelemetryMap }
				: { questionId: key, value: value as AnswerValue }
		const result = await api.saveDraft(testId, current.sessionId, body, { keepalive })
		const outcome = saveOutcomeOf(result)
		if (outcome.kind === 'ok' && !provisional && gen === generation && session?.sessionId === current.sessionId) {
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
			if (!knownQuestions.has(questionId)) continue
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
		return Math.max(0, Math.floor((deadline - serverClock.now()) / 1000))
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
		const remaining = deadline - serverClock.now()
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
			deadlinePassed = true
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
		applyStorageEffects(storage, keys, 'started')
		unsent = null
		carryReplacedText(readWal(storage, keys.wal, cachedSessionId), server.sessionId)
		if (session?.sessionId !== server.sessionId) deadlinePassed = false
		if (cached && cached.sessionId !== server.sessionId) {
			applyStorageEffects(storage, keys, 'session-replaced')
			notice({ kind: 'session-replaced' })
		} else if (cached) {
			notice({ kind: 'session-restored' })
		}
		let wal = readWal(storage, keys.wal, cachedSessionId)
		if (wal && wal.sessionId !== null && wal.sessionId !== server.sessionId) {
			applyStorageEffects(storage, keys, 'foreign-wal')
			wal = null
		}
		applyRestored(resolveRestoredDraft({ server, wal, cachedSessionId, questionIds }))
		session = { sessionId: server.sessionId, startedAt: server.startedAt }
		writeCachedSession(storage, keys.session, session)
		persistAll(server.sessionId)
	}

	function mergeServerDraft(server: AttemptSession): void {
		const local: WalRecord = {
			v: 2,
			sessionId: null,
			answers,
			pending: Object.keys(answers),
			position,
			telemetry,
			telemetryPending,
		}
		const merged = resolveRestoredDraft({ server, wal: local, cachedSessionId: null, questionIds })
		answers = merged.answers
		pending = new Set(merged.pending)
		telemetry = merged.telemetry
		telemetryPending = merged.telemetryPending
	}

	function blockStart(cached: CachedSession | null, auto = false): void {
		applyStorageEffects(storage, keys, 'start-not-assigned', { auto, sessionId: cached?.sessionId ?? null })
		session = null
		pending = new Set(Object.keys(answers))
		queue?.discard()
		phase = 'blocked'
		blockReason = 'start-not-assigned'
	}

	function needsStartRetry(): boolean {
		return initialized && phase === 'active' && session === null && !timeLimitMinutes
	}

	function clearStartRetryTimer(): void {
		if (startRetryTimer === null) return
		clock.clearTimer(startRetryTimer)
		startRetryTimer = null
	}

	function stopStartRetry(): void {
		clearStartRetryTimer()
		startRetryCount = 0
		startRetryInFlight = false
	}

	function scheduleStartRetry(): void {
		clearStartRetryTimer()
		if (!needsStartRetry()) return
		const delay = SAVE_RETRY_DELAYS_MS[Math.min(startRetryCount, SAVE_RETRY_DELAYS_MS.length - 1)] ?? 0
		startRetryCount += 1
		startRetryTimer = clock.setTimer(() => {
			startRetryTimer = null
			void retryStart()
		}, delay)
	}

	async function retryStart(): Promise<void> {
		if (startRetryInFlight || !needsStartRetry()) return
		clearStartRetryTimer()
		const gen = generation
		startRetryInFlight = true
		let server: AttemptSession
		try {
			server = await api.start(testId)
		} catch (error) {
			if (gen !== generation) return
			startRetryInFlight = false
			if (!needsStartRetry()) return
			if (classifyStartFailure(error) === 'not-assigned') {
				stopStartRetry()
				blockStart(null)
				emit()
				return
			}
			scheduleStartRetry()
			return
		}
		if (gen !== generation) return
		startRetryInFlight = false
		if (!needsStartRetry()) return
		stopStartRetry()
		serverClock.observe(server.serverNow)
		const current = position
		applyServerSession(server, null)
		if (current !== null && knownQuestions.has(current) && position !== current) {
			position = current
			recordPosition(storage, keys.wal, { sessionId: server.sessionId, position })
		}
		enqueuePending()
		emit()
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
				scheduleStartRetry()
			}
			emit()
			return
		}
		if (gen !== generation) return
		serverClock.observe(server.serverNow)
		if (mode.candidate) restoreCandidate = null
		const known = mode.candidate && cached?.sessionId !== server.sessionId ? null : cached
		applyServerSession(server, known)
		if (mode.frozen) {
			if (session && known && session.sessionId === known.sessionId) {
				await resubmit(session, true)
				return
			}
			applyStorageEffects(storage, keys, 'fresh-start')
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
		if (!activeIn(gen, current.sessionId)) return
		submitFailed = true
		emit()
	}

	function activeIn(gen: number, sessionId: string): boolean {
		return gen === generation && phase === 'active' && session?.sessionId === sessionId
	}

	function isAbandonedExpired(cached: CachedSession): boolean {
		if (!timeLimitMinutes) return false
		const startedMs = Date.parse(cached.startedAt)
		if (Number.isNaN(startedMs)) return false
		return serverClock.now() > startedMs + (timeLimitMinutes + ATTEMPT_GRACE_PERIOD_MINUTES) * 60_000
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
		submitRejection = null
		if (auto) writeFrozen()
		phase = auto ? 'autoSubmitting' : 'submitting'
		emit()
	}

	function failSubmit(auto: boolean): void {
		applyStorageEffects(storage, keys, 'submit-failed', { auto })
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
				blockStart(null, auto)
			} else {
				failSubmit(auto)
			}
			emit()
			return null
		}
		if (gen !== generation) return null
		serverClock.observe(server.serverNow)
		applyStorageEffects(storage, keys, 'started')
		unsent = null
		mergeServerDraft(server)
		session = { sessionId: server.sessionId, startedAt: server.startedAt }
		writeCachedSession(storage, keys.session, session)
		persistAll(session.sessionId)
		return session
	}

	function knownAnswers(): Record<string, AnswerValue> {
		return Object.fromEntries(Object.entries(answers).filter(([questionId]) => knownQuestions.has(questionId)))
	}

	async function sendSubmit(current: CachedSession, auto: boolean): Promise<'settled' | 'retry' | 'stale'> {
		const gen = generation
		const clientAttemptId = resolveClientAttemptId(storage, keys.clientAttemptId, current.sessionId, createId)
		let view: AttemptView
		try {
			view = await api.submit(testId, {
				sessionId: current.sessionId,
				clientAttemptId,
				answers: knownAnswers(),
				telemetry,
			})
		} catch (error) {
			if (gen !== generation) return 'stale'
			return applySubmitFailure(classifySubmitFailure(error), current, auto)
		}
		if (gen !== generation) return 'stale'
		queue?.discard()
		applyStorageEffects(storage, keys, 'submitted')
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
		acceptedAutomatically = auto
		uploadClosesAt = view.uploadClosesAt ?? null
		phase = 'submitted'
		emit()
		notice({ kind: 'submitted', result: view })
		return 'settled'
	}

	function keepUnsent(attemptId: string | null, attempt: AttemptView | null): UnsentRecord | null {
		const certain = attempt !== null
		const entries = unsentTexts({
			local: answers,
			stored: attempt ? attempt.results : null,
			textQuestionIds,
			questionOrder: questionIds,
			pending,
		})
		if (entries.length === 0) return null
		unsent = { certain, entries }
		return { v: 1, testId, attemptId, certain, entries }
	}

	function keepExpiredUnsent(certain: boolean): void {
		const entries = unsentTexts({
			local: answers,
			stored: [],
			textQuestionIds,
			questionOrder: questionIds,
			pending,
		})
		if (entries.length > 0) unsent = { certain, entries }
	}

	function carryReplacedText(wal: WalRecord | null, serverSessionId: string): void {
		if (!wal || wal.sessionId === null || wal.sessionId === serverSessionId) return
		const entries = unsentTexts({
			local: wal.answers,
			stored: null,
			textQuestionIds,
			questionOrder: questionIds,
			pending: new Set(wal.pending),
		})
		if (entries.length === 0) return
		unsent = { certain: false, entries }
		writeUnsent(storage, keys.unsent, { v: 1, testId, attemptId: null, certain: false, entries })
	}

	function walHasText(sessionId: string): boolean {
		const wal = readWal(storage, keys.wal, sessionId)
		if (!wal || (wal.sessionId !== null && wal.sessionId !== sessionId)) return false
		const entries = unsentTexts({
			local: wal.answers,
			stored: [],
			textQuestionIds,
			questionOrder: questionIds,
			pending: new Set(wal.pending),
		})
		return entries.length > 0
	}

	function closeSession(current: CachedSession, event: 'already-submitted' | 'time-expired'): void {
		queue?.discard()
		applyStorageEffects(storage, keys, event)
		closedSession = current
		session = null
		pending = new Set()
		telemetryPending = false
	}

	function applyAccepted(accepted: AcceptedOutcome, current: CachedSession): void {
		queue?.discard()
		applyStorageEffects(storage, keys, 'accepted', { unsent: keepUnsent(accepted.attemptId, accepted.attempt) })
		closedSession = current
		session = null
		pending = new Set()
		telemetryPending = false
		serverClock.observe(accepted.serverNow)
		result = accepted.attempt
		uploadClosesAt = accepted.uploadClosesAt ?? accepted.attempt?.uploadClosesAt ?? null
		acceptedAutomatically = true
		alreadySubmittedAttemptId = accepted.attemptId
		phase = 'submitted'
		emit()
		if (accepted.attempt) notice({ kind: 'submitted', result: accepted.attempt })
	}

	function applyTimeExpired(current: CachedSession, { certain }: { certain: boolean }): void {
		keepExpiredUnsent(certain)
		closeSession(current, 'time-expired')
		alreadySubmittedAttemptId = null
		phase = 'blocked'
		blockReason = 'time-expired'
		emit()
	}

	function applyAlreadySubmitted(current: CachedSession, attemptId: string | null): void {
		closeSession(current, 'already-submitted')
		alreadySubmittedAttemptId = attemptId
		phase = 'blocked'
		blockReason = 'already-submitted'
		emit()
	}

	function applySubmitFailure(failure: SubmitFailure, current: CachedSession, auto: boolean): 'settled' | 'retry' {
		if (failure.kind === 'retry') {
			applyStorageEffects(storage, keys, 'submit-failed', { auto })
			return 'retry'
		}
		if (failure.kind === 'answers-invalid') {
			applyStorageEffects(storage, keys, 'submit-failed', { auto })
			submitRejection = { reason: failure.reason, limit: failure.limit }
			enterActive(false)
			emit()
			return 'settled'
		}
		if (failure.kind === 'finalized') {
			applyAccepted(failure, current)
			return 'settled'
		}
		if (failure.kind === 'already-submitted') {
			applyAlreadySubmitted(current, failure.attemptId)
			return 'settled'
		}
		if (failure.kind === 'time-expired') {
			applyTimeExpired(current, { certain: true })
			return 'settled'
		}
		if (failure.kind === 'not-found') {
			applyStorageEffects(storage, keys, 'not-found', { auto, sessionId: current.sessionId })
			queue?.discard()
			session = null
			pending = new Set(Object.keys(answers))
			telemetryPending = Object.keys(telemetry).length > 0
		} else {
			applyStorageEffects(storage, keys, 'submit-not-assigned', { auto })
		}
		phase = 'blocked'
		blockReason = failure.kind === 'not-assigned' ? 'submit-not-assigned' : failure.kind
		emit()
		return 'settled'
	}

	function awaitFreshStart(cached: CachedSession): void {
		applyStorageEffects(storage, keys, 'fresh-start')
		restoreCandidate = cached
		clearDraftState()
		phase = 'awaitingStart'
		emit()
	}

	function restoreLocally(cached: CachedSession, frozen: boolean): void {
		if (isAbandonedExpired(cached)) {
			if (walHasText(cached.sessionId)) {
				loadLocal(cached)
				applyTimeExpired(cached, { certain: false })
			} else {
				awaitFreshStart(cached)
			}
			return
		}
		loadLocal(cached)
		phase = 'starting'
		emit()
		void runStart(cached, { frozen })
	}

	async function restoreFromFate(cached: CachedSession, frozen: boolean, readSession: ReadSession): Promise<void> {
		const gen = generation
		let fate: SessionFate
		try {
			fate = await readSession(testId, cached.sessionId)
		} catch (error) {
			if (gen !== generation) return
			if (classifyStartFailure(error) === 'not-assigned') {
				blockStart(cached)
				emit()
				return
			}
			restoreLocally(cached, frozen)
			return
		}
		if (gen !== generation) return
		serverClock.observe(fate.serverNow)
		if (fate.state === 'open') {
			await runStart(cached, { frozen })
			return
		}
		if (fate.state === 'submitted') {
			if (fate.submitSource === 'deadline') applyAccepted(fate, cached)
			else applyAlreadySubmitted(cached, fate.attemptId)
			return
		}
		if (walHasText(cached.sessionId)) applyTimeExpired(cached, { certain: true })
		else awaitFreshStart(cached)
	}

	function reset(): void {
		restoreCandidate = session ?? closedSession
		closedSession = null
		generation += 1
		stopStartRetry()
		queue?.discard()
		cancelTimeUpPause()
		clearIndicatorTimer()
		stopTick()
		segmentStartedAt = null
		warned = false
		autoFired = false
		deadlinePassed = false
		applyStorageEffects(storage, keys, 'retake')
		session = null
		blockReason = null
		alreadySubmittedAttemptId = null
		alreadySubmittedDismissed = false
		submitFailed = false
		submitRejection = null
		result = null
		acceptedAutomatically = false
		uploadClosesAt = null
		unsent = null
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
			if (needsStartRetry()) void retryStart()
			queue.retryNow()
			if (deadlinePassed && submitFailed) void runSubmit(true)
		}
	}

	function buildSnapshot(): AttemptSnapshot {
		const left = deadlinePassed ? 0 : secondsLeft()
		return {
			phase,
			blockReason,
			alreadySubmittedAttemptId,
			submitFailed,
			submitRejection,
			answers,
			currentQuestionId: position,
			startedAt: session?.startedAt ?? null,
			secondsLeft: left,
			result,
			showTimeUp,
			saveIndicator: saveIndicatorKind(indicatorInput()),
			interactionDisabled: DISABLED_PHASES.has(phase) || deadlinePassed,
			deadlinePassed,
			acceptedAutomatically,
			uploadClosesAt,
			serverOffsetMs: serverClock.offsetMs(),
			unsent,
			display: attemptDisplay({
				phase,
				blockReason,
				submitFailed,
				submitRejection,
				deadlinePassed,
				hasResult: result !== null,
				acceptedAutomatically,
				alreadySubmittedDismissed,
				timed: left !== null,
			}),
		}
	}

	return {
		init() {
			if (initialized) return
			initialized = true
			generation += 1
			stopStartRetry()
			blockReason = null
			alreadySubmittedAttemptId = null
			alreadySubmittedDismissed = false
			submitFailed = false
			submitRejection = null
			result = null
			acceptedAutomatically = false
			uploadClosesAt = null
			unsent = null
			showTimeUp = false
			segmentStartedAt = null
			warned = false
			autoFired = false
			deadlinePassed = false
			queue = createQueue()
			unsubscribeVisibility = visibility.subscribe(onVisibility)
			const cached = readCachedSession(storage, keys.session)
			const frozen = hasFrozen()
			session = null
			if (!cached) {
				if (frozen) applyStorageEffects(storage, keys, 'fresh-start')
				const stored = readUnsent(storage, keys.unsent, testId)
				if (stored) unsent = { certain: stored.certain, entries: stored.entries }
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
			if (timeLimitMinutes && api.readSession) {
				loadLocal(cached)
				phase = 'starting'
				emit()
				void restoreFromFate(cached, frozen, api.readSession)
				return
			}
			restoreLocally(cached, frozen)
		},
		async confirmStart() {
			if (!initialized || phase !== 'awaitingStart') return
			phase = 'starting'
			emit()
			await runStart(restoreCandidate, { candidate: true })
		},
		answer(questionId, value) {
			if (!initialized || phase !== 'active' || deadlinePassed || !knownQuestions.has(questionId)) return
			answers = { ...answers, [questionId]: value }
			submitRejection = null
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
		setQuestionIds(ids, textIds) {
			if (textIds) textQuestionIds = new Set(textIds)
			if (ids.length === questionIds.length && ids.every((id, index) => id === questionIds[index])) return
			questionIds = [...ids]
			knownQuestions = new Set(questionIds)
			if (position !== null && !knownQuestions.has(position)) {
				closeSegment()
				position = questionIds[0] ?? null
				openSegment()
			}
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
		dismissAlreadySubmitted() {
			if (alreadySubmittedDismissed) return
			alreadySubmittedDismissed = true
			emit()
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
			stopStartRetry()
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
