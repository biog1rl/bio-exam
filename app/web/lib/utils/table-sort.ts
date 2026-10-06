export type SortDirection = 'asc' | 'desc'

export type TableSort<K extends string> = { key: K; direction: SortDirection }

export type ParamsLike = { get(name: string): string | null }

const MAX_LIST_VALUE_LENGTH = 200
const MAX_LIST_ITEMS = 50

export function cycleSort<K extends string>(current: TableSort<K>, key: K, reset: TableSort<K>): TableSort<K> {
	if (current.key !== key) return { key, direction: 'asc' }
	return current.direction === 'asc' ? { key, direction: 'desc' } : reset
}

export function sortDirectionOf<K extends string>(sort: TableSort<K>, key: K): SortDirection | null {
	return sort.key === key ? sort.direction : null
}

export function parseSortParam<K extends string>(
	value: string | null | undefined,
	keys: readonly K[],
	fallback: TableSort<K>
): TableSort<K> {
	if (!value) return fallback
	const direction = value.startsWith('-') ? 'desc' : 'asc'
	const key = value.replace(/^-/, '') as K
	return keys.includes(key) ? { key, direction } : fallback
}

export function sortParam<K extends string>(sort: TableSort<K>, fallback: TableSort<K>): string | null {
	if (sort.key === fallback.key) return null
	return `${sort.direction === 'desc' ? '-' : ''}${sort.key}`
}

export function parseListParam(
	value: string | null | undefined,
	accept: (item: string) => boolean = () => true
): string[] {
	if (!value) return []
	const items = value
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0 && part.length <= MAX_LIST_VALUE_LENGTH && accept(part))
	return [...new Set(items)].slice(0, MAX_LIST_ITEMS)
}

function encodeValue(value: string): string {
	return encodeURIComponent(value).replace(/%2C/gi, ',')
}

export function searchString(params: Record<string, string | readonly string[] | null | undefined>): string {
	const parts: string[] = []
	for (const [name, value] of Object.entries(params)) {
		if (value === null || value === undefined) continue
		if (typeof value === 'string') {
			if (value.trim()) parts.push(`${name}=${encodeValue(value)}`)
			continue
		}
		if (value.length > 0) parts.push(`${name}=${value.map(encodeURIComponent).join(',')}`)
	}
	return parts.length > 0 ? `?${parts.join('&')}` : ''
}

export function sortRows<T, K extends string>(
	rows: readonly T[],
	sort: TableSort<K>,
	compare: (a: T, b: T, key: K) => number
): T[] {
	const sign = sort.direction === 'asc' ? 1 : -1
	return rows
		.map((row, index) => ({ row, index }))
		.sort((a, b) => sign * compare(a.row, b.row, sort.key) || a.index - b.index)
		.map((entry) => entry.row)
}

export function searchNeedle(query: string): string {
	return query.trim().toLocaleLowerCase('ru')
}

export function matchesNeedle(needle: string, values: ReadonlyArray<string | null | undefined>): boolean {
	return !needle || values.some((value) => value?.toLocaleLowerCase('ru').includes(needle))
}
