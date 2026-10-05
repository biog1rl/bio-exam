function normalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalize)
	if (value !== null && typeof value === 'object') {
		const withJson = value as { toJSON?: () => unknown }
		if (typeof withJson.toJSON === 'function') return normalize(withJson.toJSON())
		const record = value as Record<string, unknown>
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, normalize(record[key])])
		)
	}
	return value
}

export function stableSerialize(value: unknown): string {
	return JSON.stringify(normalize(value)) ?? 'undefined'
}

export type QuestionDraftCopyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type QuestionDraftCopy = { v: 1; payload: unknown; baseLockVersion: number; forbidden?: true }

const COPY_KEY_PREFIX = 'question-draft-wal-'

export function questionDraftCopyKey(draftId: string, userId: string): string {
	return `${COPY_KEY_PREFIX}${draftId}-${userId}`
}

export function readQuestionDraftCopy(storage: QuestionDraftCopyStorage, key: string): QuestionDraftCopy | null {
	try {
		const raw = storage.getItem(key)
		if (!raw) return null
		const parsed = JSON.parse(raw) as Partial<QuestionDraftCopy> | null
		if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) return null
		if (!('payload' in parsed) || parsed.payload === undefined) return null
		if (typeof parsed.baseLockVersion !== 'number' || !Number.isFinite(parsed.baseLockVersion)) return null
		const copy: QuestionDraftCopy = { v: 1, payload: parsed.payload, baseLockVersion: parsed.baseLockVersion }
		if (parsed.forbidden === true) copy.forbidden = true
		return copy
	} catch {
		return null
	}
}

export function writeQuestionDraftCopy(storage: QuestionDraftCopyStorage, key: string, copy: QuestionDraftCopy): void {
	try {
		storage.setItem(key, JSON.stringify(copy))
	} catch {
		return
	}
}

export function removeQuestionDraftCopy(storage: QuestionDraftCopyStorage, key: string): void {
	try {
		storage.removeItem(key)
	} catch {
		return
	}
}

export function forgetQuestionDraftCopies(
	storage: Pick<Storage, 'length' | 'key' | 'removeItem'>,
	draftId: string
): void {
	const prefix = `${COPY_KEY_PREFIX}${draftId}-`
	try {
		for (let index = storage.length - 1; index >= 0; index -= 1) {
			const key = storage.key(index)
			if (key !== null && key.startsWith(prefix)) storage.removeItem(key)
		}
	} catch {
		return
	}
}

export function resolveInitialDraftPayload(input: {
	copy: QuestionDraftCopy | null
	serverPayload: unknown
	serverLockVersion: number
}): { payload: unknown; restored: boolean; divergedCopy: unknown | null; dropCopy: boolean } {
	const { copy, serverPayload, serverLockVersion } = input
	const server = { payload: serverPayload, restored: false, divergedCopy: null, dropCopy: false }
	if (!copy) return server
	if (copy.forbidden) return { ...server, dropCopy: true }
	if (stableSerialize(copy.payload) === stableSerialize(serverPayload)) return { ...server, dropCopy: true }
	if (copy.baseLockVersion >= serverLockVersion) {
		return { payload: copy.payload, restored: true, divergedCopy: null, dropCopy: false }
	}
	return { ...server, divergedCopy: copy.payload }
}
