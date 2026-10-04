import { storageKeysToClear, type AttemptStorageEvent } from '../attempt-submit-flow'
import { clientAttemptIdKey, forgetClientAttemptId, type ClientAttemptStorage } from '../client-attempt-id'

export type AttemptStorageKeys = {
	session: string
	wal: string
	frozen: string
	clientAttemptId: string
}

export type CachedSession = {
	sessionId: string
	startedAt: string
}

export function attemptStorageKeys(testId: string, userId: string): AttemptStorageKeys {
	return {
		session: `test-session-${testId}-${userId}`,
		wal: `test-answers-wal-${testId}-${userId}`,
		frozen: `test-frozen-${testId}-${userId}`,
		clientAttemptId: clientAttemptIdKey(testId, userId),
	}
}

export function safeRemove(storage: ClientAttemptStorage, key: string): void {
	try {
		storage.removeItem(key)
	} catch {
		return
	}
}

export function clearAttemptKeys(
	storage: ClientAttemptStorage,
	keys: AttemptStorageKeys,
	event: AttemptStorageEvent
): void {
	for (const key of storageKeysToClear(event)) {
		if (key === 'clientAttemptId') forgetClientAttemptId(storage, keys.clientAttemptId)
		else safeRemove(storage, keys[key])
	}
}

export function readCachedSession(storage: ClientAttemptStorage, key: string): CachedSession | null {
	try {
		const raw = storage.getItem(key)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<CachedSession> | null
		if (!parsed || typeof parsed !== 'object') return null
		if (typeof parsed.sessionId !== 'string' || parsed.sessionId.length === 0) return null
		if (typeof parsed.startedAt !== 'string') return null
		return { sessionId: parsed.sessionId, startedAt: parsed.startedAt }
	} catch {
		return null
	}
}

export function writeCachedSession(storage: ClientAttemptStorage, key: string, session: CachedSession): void {
	try {
		storage.setItem(key, JSON.stringify({ sessionId: session.sessionId, startedAt: session.startedAt }))
	} catch {
		return
	}
}
