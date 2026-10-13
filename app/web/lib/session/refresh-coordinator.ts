import type { RefreshOutcome } from './client'

export const SESSION_REFRESH_LOCK = 'bio-exam:session-refresh'
export const SESSION_REFRESH_RECORD_KEY = 'bio-exam:session-refresh'
export const REFRESH_LOCK_TIMEOUT_MS = 20_000

export type RefreshRecord = { seq: number; accessExpiresAt: string | null; refreshedAt: number }

export type RefreshLocks = {
	request(
		name: string,
		options: { signal?: AbortSignal },
		callback: () => Promise<RefreshOutcome>
	): Promise<RefreshOutcome>
}

export type RefreshCoordinatorDeps = {
	locks: RefreshLocks | null
	storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
	now: () => number
	timeoutSignal: (ms: number) => AbortSignal
}

export type RefreshCoordinator = {
	coordinate(perform: () => Promise<RefreshOutcome>, seen?: number): Promise<RefreshOutcome>
	readRecord(): RefreshRecord | null
	clear(): void
}

export function parseRefreshRecord(raw: string | null): RefreshRecord | null {
	if (raw === null) return null
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		return null
	}
	if (!value || typeof value !== 'object') return null
	const { seq, accessExpiresAt, refreshedAt } = value as Record<string, unknown>
	if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return null
	if (accessExpiresAt !== null && typeof accessExpiresAt !== 'string') return null
	if (typeof refreshedAt !== 'number' || !Number.isFinite(refreshedAt)) return null
	return { seq, accessExpiresAt, refreshedAt }
}

export function createRefreshCoordinator({
	locks,
	storage,
	now,
	timeoutSignal,
}: RefreshCoordinatorDeps): RefreshCoordinator {
	function readRecord(): RefreshRecord | null {
		if (!storage) return null
		try {
			return parseRefreshRecord(storage.getItem(SESSION_REFRESH_RECORD_KEY))
		} catch {
			return null
		}
	}

	function writeRecord(record: RefreshRecord): void {
		if (!storage) return
		try {
			storage.setItem(SESSION_REFRESH_RECORD_KEY, JSON.stringify(record))
		} catch {
			return
		}
	}

	function clear(): void {
		if (!storage) return
		try {
			storage.removeItem(SESSION_REFRESH_RECORD_KEY)
		} catch {
			return
		}
	}

	async function coordinate(perform: () => Promise<RefreshOutcome>, seen?: number): Promise<RefreshOutcome> {
		if (!locks || !storage) return perform()
		const seenSeq = seen ?? readRecord()?.seq ?? 0
		const signal = timeoutSignal(REFRESH_LOCK_TIMEOUT_MS)
		let entered = false
		try {
			return await locks.request(SESSION_REFRESH_LOCK, { signal }, async () => {
				entered = true
				const record = readRecord()
				if (record && record.seq !== seenSeq) return { kind: 'ok', accessExpiresAt: record.accessExpiresAt }
				const outcome = await perform()
				if (outcome.kind === 'ok') {
					writeRecord({
						seq: Math.max(record?.seq ?? 0, seenSeq) + 1,
						accessExpiresAt: outcome.accessExpiresAt,
						refreshedAt: now(),
					})
				}
				return outcome
			})
		} catch (error) {
			if (entered) throw error
			if (signal.aborted) return { kind: 'unavailable' }
			return perform()
		}
	}

	return { coordinate, readRecord, clear }
}

function browserLocks(): RefreshLocks | null {
	if (typeof navigator === 'undefined') return null
	const manager = navigator.locks
	if (!manager || typeof manager.request !== 'function') return null
	return { request: (name, options, callback) => manager.request(name, options, callback) }
}

function browserStorage(): Storage | null {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage ?? null
	} catch {
		return null
	}
}

export function browserRefreshCoordinator(): RefreshCoordinator {
	const storage = browserStorage()
	return createRefreshCoordinator({
		locks: storage ? browserLocks() : null,
		storage,
		now: () => Date.now(),
		timeoutSignal: (ms) => AbortSignal.timeout(ms),
	})
}
