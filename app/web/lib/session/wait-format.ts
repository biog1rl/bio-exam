export function formatWait(seconds: number): string {
	const total = Math.max(0, Math.ceil(seconds))
	if (total < 60) return `${total} с`
	const minutes = Math.floor(total / 60)
	const rest = total % 60
	return rest > 0 ? `${minutes} мин ${rest} с` : `${minutes} мин`
}
