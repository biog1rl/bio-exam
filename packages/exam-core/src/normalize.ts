export function normalizeCompactString(value: unknown): string | null {
	const raw =
		typeof value === 'string'
			? value
			: typeof value === 'number' && Number.isFinite(value)
				? String(value)
				: typeof value === 'bigint'
					? value.toString()
					: null
	if (raw == null) return null
	const normalized = raw.replace(/\s+/g, '').toLowerCase()
	return normalized.length > 0 ? normalized : null
}

export function normalizeDigitsSequence(value: unknown): string | null {
	const coerced = typeof value === 'number' ? String(value) : value
	const normalized = normalizeCompactString(coerced)
	if (!normalized) return null
	return /^\d+$/.test(normalized) ? normalized : null
}

export function normalizeIdValue(value: unknown): string | null {
	if (typeof value === 'string') return value
	if (typeof value === 'number' && Number.isFinite(value)) return String(value)
	if (typeof value === 'bigint') return value.toString()
	return null
}

export function normalizeIdArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null
	const normalized = value.map((item) => normalizeIdValue(item))
	if (normalized.some((item) => item == null)) return null
	return normalized as string[]
}

export function normalizeIdRecord(value: unknown): Record<string, string> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	const entries = Object.entries(value)
	const normalizedEntries: Array<[string, string]> = []
	for (const [key, raw] of entries) {
		const normalizedValue = normalizeIdValue(raw)
		if (normalizedValue == null) return null
		normalizedEntries.push([key, normalizedValue])
	}
	return Object.fromEntries(normalizedEntries)
}
