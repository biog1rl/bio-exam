import { CLIENT_ATTEMPT_KEY_PREFIX } from '../client-attempt-id'

export const ATTEMPT_SESSION_KEY_PREFIX = 'test-session-'
export const ATTEMPT_WAL_KEY_PREFIX = 'test-answers-wal-'
export const ATTEMPT_FROZEN_KEY_PREFIX = 'test-frozen-'
export const ATTEMPT_UNSENT_KEY_PREFIX = 'test-unsent-'

const USER_KEY_PREFIXES = [
	ATTEMPT_SESSION_KEY_PREFIX,
	ATTEMPT_WAL_KEY_PREFIX,
	ATTEMPT_FROZEN_KEY_PREFIX,
	ATTEMPT_UNSENT_KEY_PREFIX,
	CLIENT_ATTEMPT_KEY_PREFIX,
]

export type EnumerableStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>

export function clearUserAttemptStorage(storage: EnumerableStorage, userId: string): void {
	const suffix = `-${userId}`
	try {
		for (let index = storage.length - 1; index >= 0; index -= 1) {
			const key = storage.key(index)
			if (key === null || !key.endsWith(suffix)) continue
			if (USER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) storage.removeItem(key)
		}
	} catch {
		return
	}
}
