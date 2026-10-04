import assert from 'node:assert/strict'
import { afterEach, beforeEach, test, vi } from 'vitest'

import {
	AUTOSAVE_SAVING_THRESHOLD_MS,
	createQuestionDraftAutosave,
	LEAVE_FLUSH_TIMEOUT_MS,
	QUESTION_DRAFT_DEBOUNCE_MS,
	type QuestionDraftAutosaveOptions,
	type QuestionDraftNotice,
	type QuestionDraftSaveResult,
} from './question-draft-autosave'
import { stableSerialize } from './question-draft-copy'

const START = Date.parse('2026-10-05T10:00:00.000Z')
const SERVER = { question: { text: 'server' } }
const P1 = { question: { text: 'p1' } }
const P2 = { question: { text: 'p2' } }

type Deferred = { promise: Promise<QuestionDraftSaveResult>; resolve: (result: QuestionDraftSaveResult) => void }
type Step = QuestionDraftSaveResult | Deferred | Error

function deferred(): Deferred {
	let resolve!: (result: QuestionDraftSaveResult) => void
	const promise = new Promise<QuestionDraftSaveResult>((r) => {
		resolve = r
	})
	return { promise, resolve }
}

function isDeferred(step: Step): step is Deferred {
	return typeof step === 'object' && step !== null && 'promise' in step
}

function fakeStorage(initial: Record<string, string> = {}) {
	const map = new Map<string, string>(Object.entries(initial))
	return {
		map,
		storage: {
			get length() {
				return map.size
			},
			key: (index: number) => [...map.keys()][index] ?? null,
			getItem: (key: string) => map.get(key) ?? null,
			setItem: (key: string, value: string) => {
				map.set(key, value)
			},
			removeItem: (key: string) => {
				map.delete(key)
			},
		},
	}
}

function fakeWindow() {
	const listeners = new Map<string, Set<(event: Event) => void>>()
	const win: QuestionDraftAutosaveOptions['win'] = {
		addEventListener: (type, listener) => {
			const set = listeners.get(type) ?? new Set()
			set.add(listener)
			listeners.set(type, set)
		},
		removeEventListener: (type, listener) => {
			listeners.get(type)?.delete(listener)
		},
	}
	return {
		win,
		count: (type: 'beforeunload' | 'pagehide') => listeners.get(type)?.size ?? 0,
		fire(type: 'beforeunload' | 'pagehide', event: Event = new Event(type)) {
			for (const listener of [...(listeners.get(type) ?? [])]) listener(event)
			return event
		},
	}
}

type SaveCall = { payload: unknown; lockVersion: number | null; keepalive: boolean; at: number }

function setup(steps: Step[] = [], extra: Partial<QuestionDraftAutosaveOptions> = {}) {
	const saveSteps = [...steps]
	const calls: SaveCall[] = []
	let nextLock = (extra.serverLockVersion ?? 1) + 1
	const save = vi.fn(async (payload: unknown, lockVersion: number | null, options: { keepalive: boolean }) => {
		calls.push({ payload, lockVersion, keepalive: options.keepalive, at: Date.now() - START })
		const next = saveSteps.shift()
		if (next === undefined) {
			const result: QuestionDraftSaveResult = { kind: 'ok', lockVersion: nextLock }
			nextLock += 1
			return result
		}
		if (next instanceof Error) throw next
		if (isDeferred(next)) return next.promise
		return next
	})
	const lockReads: Array<number | null> = []
	const readLockVersion = vi.fn(async () => lockReads.shift() ?? null)
	const notices: QuestionDraftNotice[] = []
	const store = extra.storage ? null : fakeStorage()
	const page = fakeWindow()
	const autosave = createQuestionDraftAutosave({
		draftId: 'd1',
		userId: 'u1',
		serverPayload: SERVER,
		serverLockVersion: 1,
		api: { save, readLockVersion },
		storage: store?.storage ?? extra.storage!,
		win: page.win,
		clock: {
			now: () => Date.now(),
			setTimer: (callback, ms) => setTimeout(callback, ms),
			clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		},
		onNotice: (notice) => notices.push(notice),
		...extra,
	})
	return { autosave, save, calls, readLockVersion, lockReads, notices, store, page }
}

function settle() {
	return vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(START)
})

afterEach(() => {
	vi.useRealTimers()
})

test('константы: дебаунс 700, предел досылки 5000, порог индикатора 1500', () => {
	assert.equal(QUESTION_DRAFT_DEBOUNCE_MS, 700)
	assert.equal(LEAVE_FLUSH_TIMEOUT_MS, 5000)
	assert.equal(AUTOSAVE_SAVING_THRESHOLD_MS, 1500)
})

test('stableSerialize: порядок ключей объектов не важен, порядок массивов важен', () => {
	assert.equal(stableSerialize({ b: 1, a: { d: 1, c: 2 } }), stableSerialize({ a: { c: 2, d: 1 }, b: 1 }))
	assert.notEqual(stableSerialize([1, 2]), stableSerialize([2, 1]))
	assert.equal(stableSerialize({ b: [{ y: 1, x: 2 }], a: null }), '{"a":null,"b":[{"x":2,"y":1}]}')
	assert.equal(typeof stableSerialize(undefined), 'string')
	assert.equal(stableSerialize(JSON.parse('{"__proto__":{"b":1,"a":2}}')), '{"__proto__":{"a":2,"b":1}}')
})

test('change → 700 мс → один save с lockVersion сервера; ok → saved, следующий save с новой lockVersion', async () => {
	const { autosave, calls } = setup([{ kind: 'ok', lockVersion: 5 }])
	autosave.start()
	assert.equal(autosave.getSnapshot().status, 'saved')
	autosave.change(P1)
	assert.equal(autosave.getSnapshot().status, 'pending')
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, true)
	await vi.advanceTimersByTimeAsync(699)
	assert.equal(calls.length, 0)
	await vi.advanceTimersByTimeAsync(1)
	assert.deepEqual(calls, [{ payload: P1, lockVersion: 1, keepalive: false, at: 700 }])
	assert.equal(autosave.getSnapshot().status, 'saved')
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, false)
	autosave.change(P2)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 2)
	assert.deepEqual(calls[1], { payload: P2, lockVersion: 5, keepalive: false, at: 1400 })
	autosave.dispose()
})

test('наибольшее ожидание 5 с при непрерывных правках', async () => {
	const { autosave, calls } = setup()
	autosave.start()
	for (let i = 0; i < 12; i += 1) {
		autosave.change({ question: { text: `t${i}` } })
		await vi.advanceTimersByTimeAsync(500)
	}
	assert.equal(calls.length, 1)
	assert.equal(calls[0]?.at, 5000)
	autosave.dispose()
})

test('D-26 п. 10: change и сразу flushForLeave → один save, { ok: true }, затем 10 с без вызовов', async () => {
	const { autosave, calls } = setup()
	autosave.start()
	autosave.change(P1)
	const result = await autosave.flushForLeave()
	assert.deepEqual(result, { ok: true })
	assert.equal(calls.length, 1)
	assert.deepEqual(calls[0]?.payload, P1)
	assert.equal(calls[0]?.at, 0)
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 1)
	autosave.dispose()
})

test('досылка при записи последнего payload в полёте ждёт её и второй запрос не шлёт', async () => {
	const gate = deferred()
	const { autosave, calls } = setup([gate])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 1)
	assert.equal(autosave.getSnapshot().status, 'saving')
	const leave = autosave.flushForLeave()
	assert.equal(autosave.getSnapshot().leaving, true)
	await settle()
	assert.equal(calls.length, 1)
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	assert.deepEqual(await leave, { ok: true })
	assert.equal(autosave.getSnapshot().leaving, false)
	assert.equal(calls.length, 1)
	autosave.dispose()
})

test('D-26 п. 11: повторная установка формы содержимым сервера и тот же p1 после подтверждения не шлют save', async () => {
	const { autosave, calls } = setup()
	autosave.start()
	autosave.change({ question: { text: 'server' } })
	autosave.change(SERVER)
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 0)
	assert.equal(autosave.getSnapshot().status, 'saved')
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 1)
	autosave.change({ question: { text: 'p1' } })
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 1)
	autosave.dispose()
})

test('другой порядок ключей (как после jsonb) save не вызывает', async () => {
	const { autosave, calls } = setup([], { serverPayload: { question: { a: 2, b: 1 } } })
	autosave.start()
	autosave.change({ question: { b: 1, a: 2 } })
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 0)
	autosave.dispose()
})

test('flushForLeave без несохранённой записи → { ok: true } без save', async () => {
	const { autosave, calls } = setup()
	autosave.start()
	assert.deepEqual(await autosave.flushForLeave(), { ok: true })
	assert.equal(calls.length, 0)
	autosave.dispose()
})

test('два вызова flushForLeave во время досылки → один и тот же промис', async () => {
	const gate = deferred()
	const { autosave, calls } = setup([gate])
	autosave.start()
	autosave.change(P1)
	const first = autosave.flushForLeave()
	const second = autosave.flushForLeave()
	assert.equal(first, second)
	await settle()
	assert.equal(calls.length, 1)
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	assert.deepEqual(await first, { ok: true })
	autosave.dispose()
})

test('getSnapshot стабилен между изменениями, подписчики получают изменения', async () => {
	const { autosave } = setup()
	autosave.start()
	const listener = vi.fn()
	const unsubscribe = autosave.subscribe(listener)
	const before = autosave.getSnapshot()
	assert.equal(autosave.getSnapshot(), before)
	autosave.change(P1)
	assert.notEqual(autosave.getSnapshot(), before)
	assert.ok(listener.mock.calls.length > 0)
	unsubscribe()
	const calls = listener.mock.calls.length
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(listener.mock.calls.length, calls)
	autosave.dispose()
})

const COPY_KEY = 'question-draft-wal-d1-u1'

function readCopy(map: Map<string, string>) {
	const raw = map.get(COPY_KEY)
	return raw === undefined ? null : JSON.parse(raw)
}

function storedCopy(payload: unknown, baseLockVersion: number, extra: Record<string, unknown> = {}) {
	return { [COPY_KEY]: JSON.stringify({ v: 1, payload, baseLockVersion, ...extra }) }
}

test('копия пишется синхронно в change до ответа сети; ok по последнему payload удаляет её', async () => {
	const { autosave, store, calls } = setup()
	autosave.start()
	autosave.change(P2)
	assert.deepEqual(readCopy(store!.map), { v: 1, payload: P2, baseLockVersion: 1 })
	assert.equal(calls.length, 0)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 1)
	assert.equal(readCopy(store!.map), null)
	autosave.dispose()
})

test('ok по устаревшему payload оставляет копию последнего и переписывает её baseLockVersion (R-08)', async () => {
	const gate = deferred()
	const { autosave, store, calls } = setup([gate])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	autosave.change(P2)
	assert.deepEqual(readCopy(store!.map), { v: 1, payload: P2, baseLockVersion: 1 })
	gate.resolve({ kind: 'ok', lockVersion: 6 })
	await settle()
	assert.deepEqual(readCopy(store!.map), { v: 1, payload: P2, baseLockVersion: 6 })
	await vi.advanceTimersByTimeAsync(700)
	assert.deepEqual(calls[1], { payload: P2, lockVersion: 6, keepalive: false, at: 1400 })
	assert.equal(readCopy(store!.map), null)
	autosave.dispose()
})

test('другая вкладка переписала копию: подтверждение этой вкладки её не трогает (R-08)', async () => {
	const gate = deferred()
	const { autosave, store } = setup([gate])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	const foreign = JSON.stringify({ v: 1, payload: { question: { text: 'pb' } }, baseLockVersion: 1 })
	store!.map.set(COPY_KEY, foreign)
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	await settle()
	assert.equal(store!.map.get(COPY_KEY), foreign)
	autosave.dispose()
})

test('D-26 п. 16: копия новее сервера восстанавливается и уходит сразу с lockVersion сервера', async () => {
	const { storage, map } = fakeStorage(storedCopy(P1, 5))
	const { autosave, calls, notices } = setup([], { storage, serverLockVersion: 5 })
	assert.deepEqual(autosave.initialPayload, P1)
	assert.equal(autosave.restored, true)
	assert.equal(autosave.getSnapshot().status, 'pending')
	assert.equal(autosave.getSnapshot().display, 'saving')
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, true)
	assert.deepEqual(notices, [])
	autosave.start()
	assert.deepEqual(notices, ['restored'])
	assert.equal(autosave.getSnapshot().display, 'saving')
	await settle()
	assert.deepEqual(calls, [{ payload: P1, lockVersion: 5, keepalive: false, at: 0 }])
	assert.equal(autosave.getSnapshot().status, 'saved')
	assert.equal(readCopy(map), null)
	autosave.dispose()
	autosave.start()
	assert.deepEqual(notices, ['restored'])
	autosave.dispose()
})

test('копия, равная серверу, и копия с forbidden удаляются при создании без уведомлений и save', async () => {
	for (const extra of [storedCopy({ question: { text: 'server' } }, 0), storedCopy(P1, 9, { forbidden: true })]) {
		const { storage, map } = fakeStorage(extra)
		const { autosave, calls, notices } = setup([], { storage })
		assert.equal(readCopy(map), null)
		assert.deepEqual(autosave.initialPayload, SERVER)
		assert.equal(autosave.restored, false)
		autosave.start()
		await vi.advanceTimersByTimeAsync(10_000)
		assert.deepEqual(notices, [])
		assert.equal(calls.length, 0)
		assert.equal(autosave.getSnapshot().status, 'saved')
		autosave.dispose()
	}
})

test('копия старше сервера: версия сервера, copy-diverged один раз, restoreDivergedCopy отправляет копию (R-01)', async () => {
	const { storage, map } = fakeStorage(storedCopy(P1, 4))
	const { autosave, calls, notices } = setup([], { storage, serverLockVersion: 5 })
	assert.deepEqual(autosave.initialPayload, SERVER)
	assert.equal(autosave.restored, false)
	assert.equal(autosave.getSnapshot().canRestoreCopy, true)
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, false)
	autosave.start()
	autosave.dispose()
	autosave.start()
	assert.deepEqual(notices, ['copy-diverged'])
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 0)
	assert.deepEqual(readCopy(map), { v: 1, payload: P1, baseLockVersion: 4 })
	assert.deepEqual(autosave.restoreDivergedCopy(), P1)
	assert.equal(autosave.getSnapshot().canRestoreCopy, false)
	assert.deepEqual(readCopy(map), { v: 1, payload: P1, baseLockVersion: 5 })
	assert.equal(autosave.restoreDivergedCopy(), null)
	await vi.advanceTimersByTimeAsync(700)
	assert.deepEqual(calls, [{ payload: P1, lockVersion: 5, keepalive: false, at: 10_700 }])
	autosave.dispose()
})

test('копия старше сервера: содержимое сервера не снимает canRestoreCopy, своя правка снимает и переписывает копию', async () => {
	const { storage, map } = fakeStorage(storedCopy(P1, 4))
	const { autosave } = setup([], { storage, serverLockVersion: 5 })
	autosave.start()
	autosave.change({ question: { text: 'server' } })
	assert.equal(autosave.getSnapshot().canRestoreCopy, true)
	assert.deepEqual(readCopy(map), { v: 1, payload: P1, baseLockVersion: 4 })
	autosave.change(P2)
	assert.equal(autosave.getSnapshot().canRestoreCopy, false)
	assert.deepEqual(readCopy(map), { v: 1, payload: P2, baseLockVersion: 5 })
	assert.equal(autosave.restoreDivergedCopy(), null)
	autosave.dispose()
})

test('D-26 п. 13: beforeunload только пока есть несохранённая запись', async () => {
	const { autosave, page } = setup()
	assert.equal(page.count('beforeunload'), 0)
	autosave.start()
	assert.equal(page.count('beforeunload'), 0)
	autosave.change(P1)
	assert.equal(page.count('beforeunload'), 1)
	const event = page.fire('beforeunload', new Event('beforeunload', { cancelable: true }))
	assert.equal(event.defaultPrevented, true)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(page.count('beforeunload'), 0)
	autosave.dispose()
})

test('pagehide досылает несохранённое с keepalive и без lockVersion (R-07)', async () => {
	const { autosave, page, calls } = setup()
	autosave.start()
	autosave.change(P1)
	page.fire('pagehide')
	assert.deepEqual(calls, [{ payload: P1, lockVersion: null, keepalive: true, at: 0 }])
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 1)
	autosave.dispose()
})

test('pagehide при записи последнего payload в полёте досылает её с keepalive', async () => {
	const gate = deferred()
	const { autosave, page, calls } = setup([gate])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	page.fire('pagehide')
	assert.deepEqual(
		calls.map(({ lockVersion, keepalive }) => [lockVersion, keepalive]),
		[
			[1, false],
			[null, true],
		]
	)
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	autosave.dispose()
})

test('dispose: досылка с lockVersion без keepalive и без ожидания, слушатели сняты, копия на месте', async () => {
	const { autosave, page, calls, store } = setup([deferred()])
	autosave.start()
	autosave.change(P1)
	assert.equal(page.count('pagehide'), 1)
	autosave.dispose()
	assert.deepEqual(calls, [{ payload: P1, lockVersion: 1, keepalive: false, at: 0 }])
	assert.equal(page.count('beforeunload'), 0)
	assert.equal(page.count('pagehide'), 0)
	assert.deepEqual(readCopy(store!.map), { v: 1, payload: P1, baseLockVersion: 1 })
})

test('StrictMode: start → dispose → start → change(p1) → через 700 мс save(p1) (M-1)', async () => {
	const { autosave, calls, page } = setup()
	autosave.start()
	autosave.dispose()
	autosave.start()
	assert.equal(page.count('pagehide'), 1)
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.deepEqual(calls, [{ payload: P1, lockVersion: 1, keepalive: false, at: 700 }])
	autosave.dispose()
})

test('копия черновика восстанавливается новым модулем после dispose в окне дебаунса', async () => {
	const first = setup([{ kind: 'failed' }])
	first.autosave.start()
	first.autosave.change(P1)
	first.autosave.dispose()
	await settle()
	const second = setup([], { storage: first.store!.storage })
	assert.deepEqual(second.autosave.initialPayload, P1)
	assert.equal(second.autosave.restored, true)
	second.autosave.start()
	await settle()
	assert.deepEqual(second.calls[0]?.payload, P1)
	assert.equal(readCopy(first.store!.map), null)
	second.autosave.dispose()
})

test('D-26 п. 12: сбой → error failed, автоповторы с паузами, уход возвращает отказ, «Повторить» → saved', async () => {
	const gate = deferred()
	const { autosave, calls } = setup([{ kind: 'failed' }, { kind: 'failed' }, { kind: 'failed' }, gate])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(autosave.getSnapshot().status, 'error')
	assert.equal(autosave.getSnapshot().error, 'failed')
	assert.equal(autosave.getSnapshot().display, 'error')
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, true)
	await vi.advanceTimersByTimeAsync(999)
	assert.equal(calls.length, 1)
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(calls.length, 2)
	assert.equal(autosave.getSnapshot().error, 'failed')
	assert.deepEqual(await autosave.flushForLeave(), { ok: false, reason: 'failed' })
	assert.equal(calls.length, 3)
	autosave.retry()
	assert.equal(calls.length, 4)
	assert.equal(autosave.getSnapshot().display, 'saving')
	assert.equal(autosave.getSnapshot().status, 'saving')
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	await settle()
	assert.equal(autosave.getSnapshot().status, 'saved')
	assert.equal(autosave.getSnapshot().display, 'saved')
	assert.equal(autosave.getSnapshot().error, null)
	autosave.dispose()
})

test('досылка дольше 5 с → { ok: false, failed } на 5000 мс; поздний ok снимает ошибку и удаляет копию', async () => {
	const gate = deferred()
	const { autosave, calls, store } = setup([gate])
	autosave.start()
	autosave.change(P1)
	let result: unknown = null
	void autosave.flushForLeave().then((value) => {
		result = value
	})
	await vi.advanceTimersByTimeAsync(4999)
	assert.equal(result, null)
	assert.equal(autosave.getSnapshot().leaving, true)
	await vi.advanceTimersByTimeAsync(1)
	assert.deepEqual(result, { ok: false, reason: 'failed' })
	assert.equal(autosave.getSnapshot().leaving, false)
	assert.equal(autosave.getSnapshot().status, 'error')
	assert.equal(autosave.getSnapshot().error, 'failed')
	assert.equal(calls.length, 1)
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	await settle()
	assert.equal(autosave.getSnapshot().status, 'saved')
	assert.equal(readCopy(store!.map), null)
	autosave.dispose()
})

test('D-26 п. 15: 409 → перечитана версия, один повтор с ней, conflict-resolved', async () => {
	const { autosave, calls, lockReads, notices, readLockVersion } = setup([
		{ kind: 'conflict' },
		{ kind: 'ok', lockVersion: 10 },
	])
	lockReads.push(9)
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(readLockVersion.mock.calls.length, 1)
	assert.deepEqual(
		calls.map(({ payload, lockVersion }) => [payload, lockVersion]),
		[
			[P1, 1],
			[P1, 9],
		]
	)
	assert.deepEqual(notices, ['conflict-resolved'])
	assert.equal(autosave.getSnapshot().status, 'saved')
	autosave.change(P2)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls[2]?.lockVersion, 10)
	autosave.dispose()
})

test('D-26 п. 15: второй 409 подряд → error conflict, conflict-repeated, без автоповторов; retry отправляет снова', async () => {
	const gate = deferred()
	const { autosave, calls, lockReads, notices } = setup([{ kind: 'conflict' }, { kind: 'conflict' }, gate])
	lockReads.push(9)
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 2)
	assert.equal(autosave.getSnapshot().status, 'error')
	assert.equal(autosave.getSnapshot().error, 'conflict')
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, true)
	assert.deepEqual(notices, ['conflict-repeated'])
	await vi.advanceTimersByTimeAsync(60_000)
	assert.equal(calls.length, 2)
	assert.deepEqual(await autosave.flushForLeave(), { ok: false, reason: 'failed' })
	autosave.retry()
	assert.equal(calls.length, 3)
	assert.deepEqual(calls[2]?.payload, P1)
	assert.equal(calls[2]?.lockVersion, 9)
	assert.equal(autosave.getSnapshot().display, 'saving')
	gate.resolve({ kind: 'ok', lockVersion: 11 })
	await settle()
	assert.equal(autosave.getSnapshot().status, 'saved')
	assert.deepEqual(notices, ['conflict-repeated'])
	autosave.dispose()
})

test('409 и сбой перечитывания версии → автоповтор как при сбое сети', async () => {
	const { autosave, calls } = setup([{ kind: 'conflict' }])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 1)
	assert.equal(autosave.getSnapshot().error, 'failed')
	await vi.advanceTimersByTimeAsync(1000)
	assert.equal(calls.length, 2)
	assert.equal(autosave.getSnapshot().status, 'saved')
	autosave.dispose()
})

test('CR-02: p1 в полёте, change(p2), dispose, сервер применил p2 первым, p1 получил 409 → повтор несёт p2, на сервере p2', async () => {
	const first = deferred()
	const second = deferred()
	const { autosave, calls, lockReads } = setup([first, second])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 1)
	autosave.change(P2)
	autosave.dispose()
	assert.deepEqual(
		calls.map(({ payload, lockVersion }) => [payload, lockVersion]),
		[
			[P1, 1],
			[P2, 1],
		]
	)
	second.resolve({ kind: 'ok', lockVersion: 2 })
	await settle()
	lockReads.push(2)
	first.resolve({ kind: 'conflict' })
	await settle()
	await vi.advanceTimersByTimeAsync(10_000)
	assert.deepEqual(
		calls.map(({ payload, lockVersion }) => [payload, lockVersion]),
		[
			[P1, 1],
			[P2, 1],
			[P2, 2],
		]
	)
	assert.deepEqual(calls.at(-1)?.payload, P2)
})

test('CR-02: 409 при ожидающей правке p2 → повтор шлёт p2, conflict-resolved, повторной записи p1 нет', async () => {
	const gate = deferred()
	const { autosave, calls, lockReads, notices, store } = setup([gate])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 1)
	autosave.change(P2)
	lockReads.push(2)
	gate.resolve({ kind: 'conflict' })
	await settle()
	assert.deepEqual(
		calls.map(({ payload, lockVersion }) => [payload, lockVersion]),
		[
			[P1, 1],
			[P2, 2],
		]
	)
	assert.deepEqual(notices, ['conflict-resolved'])
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 2)
	assert.equal(autosave.getSnapshot().status, 'saved')
	assert.equal(readCopy(store!.map), null)
	autosave.dispose()
})

test('403 → error forbidden без повторов, копия помечена и не восстанавливается при следующем открытии (R-10)', async () => {
	const { autosave, calls, notices, store, page } = setup([{ kind: 'forbidden' }])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(autosave.getSnapshot().status, 'error')
	assert.equal(autosave.getSnapshot().error, 'forbidden')
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, true)
	assert.equal(page.count('beforeunload'), 1)
	assert.deepEqual(notices, ['forbidden'])
	assert.deepEqual(readCopy(store!.map), { v: 1, payload: P1, baseLockVersion: 1, forbidden: true })
	await vi.advanceTimersByTimeAsync(60_000)
	autosave.retry()
	await settle()
	assert.equal(calls.length, 1)
	assert.deepEqual(await autosave.flushForLeave(), { ok: false, reason: 'forbidden' })
	autosave.change(P2)
	assert.deepEqual(readCopy(store!.map), { v: 1, payload: P2, baseLockVersion: 1, forbidden: true })
	await vi.advanceTimersByTimeAsync(60_000)
	assert.equal(calls.length, 1)
	assert.deepEqual(notices, ['forbidden'])
	autosave.dispose()
	const next = setup([], { storage: store!.storage })
	assert.deepEqual(next.autosave.initialPayload, SERVER)
	assert.equal(next.autosave.restored, false)
	next.autosave.start()
	await vi.advanceTimersByTimeAsync(10_000)
	assert.deepEqual(next.notices, [])
	assert.equal(next.calls.length, 0)
	assert.equal(readCopy(store!.map), null)
	next.autosave.dispose()
})

test('404 → error gone, копия удалена сразу, нет несохранённой записи и слушателя, уход → gone (R-10)', async () => {
	const { autosave, calls, notices, store, page } = setup([{ kind: 'gone' }])
	autosave.start()
	autosave.change(P1)
	assert.equal(page.count('beforeunload'), 1)
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(autosave.getSnapshot().status, 'error')
	assert.equal(autosave.getSnapshot().error, 'gone')
	assert.equal(autosave.getSnapshot().display, 'error')
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, false)
	assert.equal(page.count('beforeunload'), 0)
	assert.equal(readCopy(store!.map), null)
	assert.deepEqual(notices, ['gone'])
	assert.deepEqual(await autosave.flushForLeave(), { ok: false, reason: 'gone' })
	autosave.retry()
	autosave.change(P2)
	await vi.advanceTimersByTimeAsync(60_000)
	assert.equal(calls.length, 1)
	assert.equal(readCopy(store!.map), null)
	assert.deepEqual(notices, ['gone'])
	autosave.dispose()
})

test('D-26 п. 14: closeForSave ждёт запрос в полёте, после закрытия change не шлёт и не пишет копию; reopen возвращает работу', async () => {
	const gate = deferred()
	const { autosave, calls, store, page } = setup([gate])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(700)
	autosave.change(P2)
	let closed = false
	void autosave.closeForSave().then(() => {
		closed = true
	})
	await vi.advanceTimersByTimeAsync(5000)
	assert.equal(closed, false)
	assert.equal(calls.length, 1)
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	await settle()
	assert.equal(closed, true)
	assert.equal(autosave.getSnapshot().status, 'closed')
	assert.equal(autosave.getSnapshot().display, 'hidden')
	assert.equal(autosave.getSnapshot().hasUnsavedWrite, false)
	assert.equal(page.count('beforeunload'), 0)
	assert.deepEqual(await autosave.flushForLeave(), { ok: true })
	const copyBefore = store!.map.get(COPY_KEY)
	autosave.change({ question: { text: 'p3' } })
	page.fire('pagehide')
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 1)
	assert.equal(store!.map.get(COPY_KEY), copyBefore)
	autosave.reopen()
	assert.equal(autosave.getSnapshot().status, 'pending')
	await vi.advanceTimersByTimeAsync(700)
	assert.deepEqual(calls[1], {
		payload: { question: { text: 'p3' } },
		lockVersion: 2,
		keepalive: false,
		at: 5700 + 10_000 + 700,
	})
	autosave.change({ question: { text: 'p4' } })
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 3)
	autosave.dispose()
})

test('closeForSave без записи в полёте разрешается сразу; discardCopy удаляет копию', async () => {
	const { autosave, calls, store } = setup()
	autosave.start()
	autosave.change(P1)
	await autosave.closeForSave()
	assert.equal(autosave.getSnapshot().status, 'closed')
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 0)
	assert.notEqual(readCopy(store!.map), null)
	autosave.discardCopy()
	assert.equal(readCopy(store!.map), null)
	autosave.dispose()
})

test('индикатор: подтверждение за 900 мс — всё время Сохранено', async () => {
	const gate = deferred()
	const { autosave } = setup([gate])
	const displays: string[] = []
	autosave.subscribe(() => displays.push(autosave.getSnapshot().display))
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(900)
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	await vi.advanceTimersByTimeAsync(5000)
	assert.equal(autosave.getSnapshot().display, 'saved')
	assert.ok(displays.length > 0)
	assert.ok(displays.every((display) => display === 'saved'))
	autosave.dispose()
})

test('индикатор: подтверждение задержано → Сохранение… с 1500 мс', async () => {
	const gate = deferred()
	const { autosave } = setup([gate])
	autosave.start()
	autosave.change(P1)
	await vi.advanceTimersByTimeAsync(1499)
	assert.equal(autosave.getSnapshot().status, 'saving')
	assert.equal(autosave.getSnapshot().display, 'saved')
	await vi.advanceTimersByTimeAsync(1)
	assert.equal(autosave.getSnapshot().display, 'saving')
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	await settle()
	assert.equal(autosave.getSnapshot().display, 'saved')
	autosave.change(P2)
	await vi.advanceTimersByTimeAsync(1499)
	assert.equal(autosave.getSnapshot().display, 'saved')
	autosave.dispose()
})

test('StrictMode с восстановленной копией: запрос в полёте не дублируется новой очередью', async () => {
	const gate = deferred()
	const { storage } = fakeStorage(storedCopy(P1, 1))
	const { autosave, calls, notices } = setup([gate], { storage })
	autosave.start()
	autosave.dispose()
	autosave.start()
	await vi.advanceTimersByTimeAsync(700)
	assert.equal(calls.length, 1)
	gate.resolve({ kind: 'ok', lockVersion: 2 })
	await settle()
	await vi.advanceTimersByTimeAsync(10_000)
	assert.equal(calls.length, 1)
	assert.equal(autosave.getSnapshot().status, 'saved')
	assert.deepEqual(notices, ['restored'])
	autosave.dispose()
})

test('dispose с несохранённой записью не оставляет таймеров модуля', async () => {
	const { autosave } = setup([deferred()])
	autosave.start()
	autosave.change(P1)
	autosave.dispose()
	assert.equal(vi.getTimerCount(), 0)
})
