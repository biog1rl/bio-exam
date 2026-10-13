import { clientAttemptIdKey, forgetClientAttemptId, type ClientAttemptStorage } from '../client-attempt-id'
import {
	ATTEMPT_FROZEN_KEY_PREFIX,
	ATTEMPT_SESSION_KEY_PREFIX,
	ATTEMPT_UNSENT_KEY_PREFIX,
	ATTEMPT_WAL_KEY_PREFIX,
} from './user-storage'
import { detachWal, readWal } from './wal'
import type { UnsentEntry, UnsentRecord } from './wal-reconcile'

export type AttemptStorageKeys = {
	session: string
	wal: string
	frozen: string
	clientAttemptId: string
	unsent: string
}

export type CachedSession = {
	sessionId: string
	startedAt: string
}

export function attemptStorageKeys(testId: string, userId: string): AttemptStorageKeys {
	return {
		session: `${ATTEMPT_SESSION_KEY_PREFIX}${testId}-${userId}`,
		wal: `${ATTEMPT_WAL_KEY_PREFIX}${testId}-${userId}`,
		frozen: `${ATTEMPT_FROZEN_KEY_PREFIX}${testId}-${userId}`,
		clientAttemptId: clientAttemptIdKey(testId, userId),
		unsent: `${ATTEMPT_UNSENT_KEY_PREFIX}${testId}-${userId}`,
	}
}

export type AttemptStorageEvent =
	| 'submitted'
	| 'retake'
	| 'accepted'
	| 'already-submitted'
	| 'time-expired'
	| 'not-found'
	| 'submit-not-assigned'
	| 'start-not-assigned'
	| 'submit-failed'
	| 'session-replaced'
	| 'fresh-start'
	| 'started'
	| 'foreign-wal'

export type StorageEffects = {
	session: boolean
	clientAttemptId: boolean
	unsent: boolean
	frozen: boolean | 'if-auto'
	wal: 'keep' | 'remove' | 'detach' | 'to-unsent'
}

export type StorageEffectsContext = {
	auto?: boolean
	sessionId?: string | null
	unsent?: UnsentRecord | null
}

const KEEP_ALL: StorageEffects = { session: false, clientAttemptId: false, unsent: false, frozen: false, wal: 'keep' }
const REMOVE_ALL: StorageEffects = { session: true, clientAttemptId: true, unsent: true, frozen: true, wal: 'remove' }

export const STORAGE_EFFECTS: Record<AttemptStorageEvent, StorageEffects> = {
	submitted: REMOVE_ALL,
	retake: REMOVE_ALL,
	accepted: { session: true, clientAttemptId: true, unsent: false, frozen: true, wal: 'to-unsent' },
	'already-submitted': { session: true, clientAttemptId: true, unsent: false, frozen: true, wal: 'remove' },
	'time-expired': { session: true, clientAttemptId: true, unsent: false, frozen: true, wal: 'keep' },
	'not-found': { session: true, clientAttemptId: true, unsent: false, frozen: 'if-auto', wal: 'detach' },
	'submit-not-assigned': { ...KEEP_ALL, frozen: 'if-auto' },
	'start-not-assigned': { session: true, clientAttemptId: true, unsent: false, frozen: 'if-auto', wal: 'detach' },
	'submit-failed': { ...KEEP_ALL, frozen: 'if-auto' },
	'session-replaced': { session: false, clientAttemptId: true, unsent: false, frozen: true, wal: 'remove' },
	'fresh-start': { ...KEEP_ALL, frozen: true },
	started: { ...KEEP_ALL, unsent: true },
	'foreign-wal': { ...KEEP_ALL, wal: 'remove' },
}

function present(storage: ClientAttemptStorage, key: string): boolean {
	try {
		return storage.getItem(key) !== null
	} catch {
		return false
	}
}

function removePresent(storage: ClientAttemptStorage, key: string): void {
	if (!present(storage, key)) return
	try {
		storage.removeItem(key)
	} catch {
		return
	}
}

function applyWalEffect(
	storage: ClientAttemptStorage,
	keys: AttemptStorageKeys,
	effect: StorageEffects['wal'],
	context: StorageEffectsContext
): void {
	if (effect === 'keep') return
	if (effect === 'remove') {
		removePresent(storage, keys.wal)
		return
	}
	if (effect === 'detach') {
		const sessionId = context.sessionId ?? null
		const wal = readWal(storage, keys.wal, sessionId)
		if (wal && (wal.sessionId === null || wal.sessionId === sessionId)) detachWal(storage, keys.wal, sessionId)
		return
	}
	const record = context.unsent ?? null
	if (record === null || writeUnsent(storage, keys.unsent, record)) removePresent(storage, keys.wal)
}

export function applyStorageEffects(
	storage: ClientAttemptStorage,
	keys: AttemptStorageKeys,
	event: AttemptStorageEvent,
	context: StorageEffectsContext = {}
): void {
	const effects = STORAGE_EFFECTS[event]
	if (effects.session) removePresent(storage, keys.session)
	if (effects.clientAttemptId && present(storage, keys.clientAttemptId)) {
		forgetClientAttemptId(storage, keys.clientAttemptId)
	}
	if (effects.unsent) removePresent(storage, keys.unsent)
	if (effects.frozen === true || (effects.frozen === 'if-auto' && context.auto === true)) {
		removePresent(storage, keys.frozen)
	}
	applyWalEffect(storage, keys, effects.wal, context)
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

export function writeUnsent(storage: ClientAttemptStorage, key: string, record: UnsentRecord): boolean {
	try {
		storage.setItem(key, JSON.stringify(record))
		return true
	} catch {
		return false
	}
}

function isUnsentEntry(value: unknown): value is UnsentEntry {
	if (!value || typeof value !== 'object') return false
	const entry = value as Partial<UnsentEntry>
	return typeof entry.questionId === 'string' && typeof entry.number === 'number' && typeof entry.text === 'string'
}

export function readUnsent(storage: ClientAttemptStorage, key: string, testId: string): UnsentRecord | null {
	try {
		const raw = storage.getItem(key)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<UnsentRecord> | null
		if (!parsed || typeof parsed !== 'object' || parsed.v !== 1 || parsed.testId !== testId) return null
		if (typeof parsed.certain !== 'boolean' || !Array.isArray(parsed.entries)) return null
		if (parsed.entries.length === 0 || !parsed.entries.every(isUnsentEntry)) return null
		const attemptId = typeof parsed.attemptId === 'string' ? parsed.attemptId : null
		return { v: 1, testId, attemptId, certain: parsed.certain, entries: parsed.entries }
	} catch {
		return null
	}
}
