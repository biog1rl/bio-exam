export function toggleFilterValue<V extends string>(
	selected: readonly V[],
	value: V,
	checked: boolean,
	order: readonly V[]
): V[] {
	const next = new Set(selected)
	if (checked) next.add(value)
	else next.delete(value)
	return order.filter((item) => next.has(item))
}

export function parseFilterList<V extends string>(value: string | null | undefined, order: readonly V[]): V[] {
	if (!value) return []
	const parts = new Set(value.split(','))
	return order.filter((item) => parts.has(item))
}
