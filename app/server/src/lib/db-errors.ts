const TRANSIENT_MESSAGES = [
	'connection terminated unexpectedly',
	'query read timeout',
	'econnreset',
	'etimedout',
	'eai_again',
]

const TRANSIENT_SQLSTATE_CLASSES = new Set(['08', '40', '53', '57'])

const TRANSIENT_SQLSTATE_CODES = new Set(['55P03'])

function errorText(err: unknown): string {
	if (err instanceof Error) {
		const parts = [err.message]
		const cause = (err as Error & { cause?: unknown }).cause
		if (cause instanceof Error) parts.push(cause.message)
		return parts.join(' | ')
	}
	return String(err)
}

function sqlStateOf(err: unknown): string | null {
	const candidates = [err, err && typeof err === 'object' ? (err as { cause?: unknown }).cause : undefined]
	for (const candidate of candidates) {
		if (!candidate || typeof candidate !== 'object') continue
		const code = (candidate as { code?: unknown }).code
		if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
	}
	return null
}

export function isTransientDbError(err: unknown): boolean {
	const sqlState = sqlStateOf(err)
	if (sqlState && (TRANSIENT_SQLSTATE_CLASSES.has(sqlState.slice(0, 2)) || TRANSIENT_SQLSTATE_CODES.has(sqlState))) {
		return true
	}
	const message = errorText(err).toLowerCase()
	return TRANSIENT_MESSAGES.some((marker) => message.includes(marker))
}
