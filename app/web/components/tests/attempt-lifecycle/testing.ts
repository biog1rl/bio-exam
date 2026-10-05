import type {
	AttemptSession,
	AttemptView,
	SaveAttemptDraftRequest,
	SubmitAttemptRequest,
	TelemetryMap,
} from '@bio-exam/exam-core'

import { vi } from 'vitest'

import { AttemptRequestError, type AttemptDraftSaveResult } from '@/lib/tests/api'

import type { ClientAttemptStorage } from '../client-attempt-id'
import {
	createAttemptLifecycle,
	type AttemptClock,
	type AttemptLifecycleApi,
	type AttemptLifecycleOptions,
	type AttemptVisibility,
	type AttemptVisibilityEvent,
} from './lifecycle'
import { attemptStorageKeys } from './storage-keys'

export const TEST_ID = 'test-1'
export const USER_ID = 'user-1'
export const Q1 = '11111111-1111-4111-8111-111111111111'
export const Q2 = '22222222-2222-4222-8222-222222222222'
export const Q3 = '33333333-3333-4333-8333-333333333333'
export const QUESTION_IDS: readonly string[] = [Q1, Q2, Q3]
export const KEYS = attemptStorageKeys(TEST_ID, USER_ID)
export const STARTED_AT = '2026-10-04T10:00:00.000Z'
export const START = Date.parse(STARTED_AT)

export type MemoryStorage = ClientAttemptStorage & { data: Map<string, string>; failWrites: boolean }

export function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
	const data = new Map(Object.entries(initial))
	const storage: MemoryStorage = {
		data,
		failWrites: false,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			if (storage.failWrites) throw new Error('QuotaExceededError')
			data.set(key, value)
		},
		removeItem: (key) => {
			data.delete(key)
		},
	}
	return storage
}

export function readJson(storage: MemoryStorage, key: string): unknown {
	const raw = storage.data.get(key)
	return raw === undefined ? undefined : JSON.parse(raw)
}

export function fakeVisibility(hidden = false) {
	const listeners = new Set<(event: AttemptVisibilityEvent) => void>()
	const state = { hidden }
	const visibility: AttemptVisibility = {
		isHidden: () => state.hidden,
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
	return {
		visibility,
		listenerCount: () => listeners.size,
		emit(event: AttemptVisibilityEvent) {
			if (event === 'hidden') state.hidden = true
			if (event === 'visible') state.hidden = false
			for (const listener of [...listeners]) listener(event)
		},
	}
}

export type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

export function deferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => undefined
	const promise = new Promise<T>((done) => {
		resolve = done
	})
	return { promise, resolve }
}

export function sessionOf(
	sessionId: string,
	startedAt: string = STARTED_AT,
	draft: {
		answers?: Record<string, unknown> | null
		lastQuestionId?: string | null
		telemetry?: TelemetryMap | null
	} = {}
): AttemptSession {
	return {
		sessionId,
		startedAt,
		draftAnswers: draft.answers ?? null,
		draftLastQuestionId: draft.lastQuestionId ?? null,
		draftTelemetry: draft.telemetry ?? null,
	}
}

export function requestError(
	status: number,
	code: string | null = null,
	attemptId: string | null = null
): AttemptRequestError {
	return new AttemptRequestError(status, code, attemptId)
}

export const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444'

export function attemptViewOf(attemptId: string = ATTEMPT_ID): AttemptView {
	return {
		attemptId,
		submittedAt: '2026-10-04T10:05:00.000Z',
		earnedPoints: 1,
		totalPoints: 3,
		scorePercentage: 33,
		passed: false,
		reviewStatus: 'none',
		autoEarnedPoints: 1,
		autoTotalPoints: 3,
		results: [],
	}
}

export function sequentialIds(prefix = 'client'): () => string {
	let counter = 0
	return () => {
		counter += 1
		return `${prefix}-${counter}`
	}
}

export const OK: AttemptDraftSaveResult = { kind: 'response', status: 200 }
export const NETWORK: AttemptDraftSaveResult = { kind: 'network' }

export function response(status: number): AttemptDraftSaveResult {
	return { kind: 'response', status }
}

type StartStep = AttemptSession | Error
type SaveStep = AttemptDraftSaveResult | Deferred<AttemptDraftSaveResult>
type SubmitStep = AttemptView | Error | Deferred<AttemptView | Error>

export function fakeAttemptApi(starts: StartStep[] = []) {
	const startQueue: StartStep[] = [...starts]
	const saveQueue: SaveStep[] = []
	const submitQueue: SubmitStep[] = []
	const state: { saveDefault: AttemptDraftSaveResult } = { saveDefault: OK }
	const start = vi.fn(async (_testId: string): Promise<AttemptSession> => {
		const next = startQueue.length > 1 ? startQueue.shift() : startQueue[0]
		if (!next) throw new Error('unexpected start')
		if (next instanceof Error) throw next
		return next
	})
	const saveDraft = vi.fn(
		async (
			_testId: string,
			_sessionId: string,
			_body: SaveAttemptDraftRequest,
			_options: { keepalive: boolean }
		): Promise<AttemptDraftSaveResult> => {
			const next = saveQueue.shift()
			if (!next) return state.saveDefault
			if ('promise' in next) return next.promise
			return next
		}
	)
	const submit = vi.fn(async (_testId: string, _request: SubmitAttemptRequest): Promise<AttemptView> => {
		const next = submitQueue.shift()
		if (!next) throw new Error('unexpected submit')
		const value = 'promise' in next ? await next.promise : next
		if (value instanceof Error) throw value
		return value
	})
	const api: AttemptLifecycleApi = { start, saveDraft, submit }
	return {
		api,
		start,
		saveDraft,
		submit,
		queueStart(...steps: StartStep[]) {
			startQueue.length = 0
			startQueue.push(...steps)
		},
		queueSave(...steps: SaveStep[]) {
			saveQueue.push(...steps)
		},
		queueSubmit(...steps: SubmitStep[]) {
			submitQueue.push(...steps)
		},
		submitRequests(): SubmitAttemptRequest[] {
			return submit.mock.calls.map((call) => call[1])
		},
		setSaveDefault(result: AttemptDraftSaveResult) {
			state.saveDefault = result
		},
		savedBodies(): SaveAttemptDraftRequest[] {
			return saveDraft.mock.calls.map((call) => call[2])
		},
	}
}

export const realClock: AttemptClock = {
	now: () => Date.now(),
	setTimer: (callback, ms) => setTimeout(callback, ms),
	clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function setupLifecycle(
	input: {
		storage?: MemoryStorage
		api?: ReturnType<typeof fakeAttemptApi>
		visibility?: ReturnType<typeof fakeVisibility>
		timeLimitMinutes?: number | null
		createId?: () => string
	} = {}
) {
	const storage = input.storage ?? memoryStorage()
	const fakeApi = input.api ?? fakeAttemptApi([sessionOf('s1')])
	const page = input.visibility ?? fakeVisibility()
	const onNotice = vi.fn()
	const options: AttemptLifecycleOptions = {
		testId: TEST_ID,
		userId: USER_ID,
		questionIds: QUESTION_IDS,
		timeLimitMinutes: input.timeLimitMinutes ?? null,
		storage,
		api: fakeApi.api,
		visibility: page.visibility,
		clock: realClock,
		createId: input.createId ?? sequentialIds(),
		onNotice,
	}
	const lifecycle = createAttemptLifecycle(options)
	return { lifecycle, storage, fakeApi, page, onNotice }
}

export async function settle(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0)
}

export type AttemptKeyName = 'session' | 'wal' | 'frozen' | 'clientAttemptId'

export function walTelemetry(storage: MemoryStorage): TelemetryMap | undefined {
	const wal = readJson(storage, KEYS.wal) as { telemetry?: TelemetryMap } | undefined
	return wal?.telemetry
}

export function walTelemetryPending(storage: MemoryStorage): boolean | undefined {
	const wal = readJson(storage, KEYS.wal) as { telemetryPending?: boolean } | undefined
	return wal?.telemetryPending
}

export function presentKeys(storage: MemoryStorage): AttemptKeyName[] {
	const names: AttemptKeyName[] = ['session', 'wal', 'frozen', 'clientAttemptId']
	return names.filter((name) => storage.data.has(KEYS[name]))
}

export function seededStorage(
	input: {
		session?: { sessionId: string; startedAt?: string }
		clientAttempt?: { sessionId: string; clientAttemptId: string }
		wal?: {
			sessionId: string | null
			answers: Record<string, unknown>
			pending?: string[]
			telemetry?: TelemetryMap
			telemetryPending?: boolean
		}
		frozen?: boolean
	} = {}
): MemoryStorage {
	const initial: Record<string, string> = {}
	if (input.session) {
		initial[KEYS.session] = JSON.stringify({
			sessionId: input.session.sessionId,
			startedAt: input.session.startedAt ?? STARTED_AT,
		})
	}
	if (input.clientAttempt) initial[KEYS.clientAttemptId] = JSON.stringify(input.clientAttempt)
	if (input.wal) {
		initial[KEYS.wal] = JSON.stringify({
			v: 2,
			sessionId: input.wal.sessionId,
			answers: input.wal.answers,
			pending: input.wal.pending ?? Object.keys(input.wal.answers),
			position: null,
			telemetry: input.wal.telemetry ?? {},
			telemetryPending: input.wal.telemetryPending ?? false,
		})
	}
	if (input.frozen) initial[KEYS.frozen] = '1'
	return memoryStorage(initial)
}
