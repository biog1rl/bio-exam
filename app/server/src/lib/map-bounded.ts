export async function mapBounded<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	if (!Number.isInteger(limit) || limit < 1)
		throw new RangeError(`mapBounded limit must be a positive integer: ${limit}`)
	const results = new Array<R>(items.length)
	let next = 0
	let failed = false

	const worker = async (): Promise<void> => {
		while (!failed && next < items.length) {
			const index = next
			next += 1
			try {
				results[index] = await fn(items[index] as T, index)
			} catch (error) {
				failed = true
				throw error
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
	return results
}
