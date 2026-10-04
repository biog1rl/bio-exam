export type ClientAttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type StoredClientAttempt = {
	sessionId: string
	clientAttemptId: string
}

export function clientAttemptIdKey(testId: string, userId: string): string {
	return `test-client-attempt-${testId}-${userId}`
}

function readStoredClientAttempt(storage: ClientAttemptStorage, key: string): StoredClientAttempt | null {
	try {
		const raw = storage.getItem(key)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<StoredClientAttempt> | null
		if (!parsed || typeof parsed.sessionId !== 'string' || typeof parsed.clientAttemptId !== 'string') return null
		return { sessionId: parsed.sessionId, clientAttemptId: parsed.clientAttemptId }
	} catch {
		return null
	}
}

export function resolveClientAttemptId(
	storage: ClientAttemptStorage,
	key: string,
	sessionId: string,
	createId: () => string = () => crypto.randomUUID()
): string {
	const stored = readStoredClientAttempt(storage, key)
	if (stored && stored.sessionId === sessionId) return stored.clientAttemptId

	const clientAttemptId = createId()
	try {
		storage.setItem(key, JSON.stringify({ sessionId, clientAttemptId }))
	} catch {
		return clientAttemptId
	}
	return clientAttemptId
}

export function storedClientAttemptId(storage: ClientAttemptStorage, key: string, sessionId: string): string | null {
	const stored = readStoredClientAttempt(storage, key)
	return stored && stored.sessionId === sessionId ? stored.clientAttemptId : null
}

export function forgetClientAttemptId(storage: ClientAttemptStorage, key: string): void {
	try {
		storage.removeItem(key)
	} catch {
		return
	}
}
