export type SortDirection = 'asc' | 'desc'

export type TableSort<K extends string> = { key: K; direction: SortDirection }

export function cycleSort<K extends string>(current: TableSort<K>, key: K, reset: TableSort<K>): TableSort<K> {
	if (current.key !== key) return { key, direction: 'asc' }
	return current.direction === 'asc' ? { key, direction: 'desc' } : reset
}

export function sortDirectionOf<K extends string>(sort: TableSort<K>, key: K): SortDirection | null {
	return sort.key === key ? sort.direction : null
}
