export function formatPercent(value: number): string {
	return `${Math.round(value)}%`
}

export function formatPoints(points: { earned: number; total: number }): string {
	return `${points.earned} из ${points.total}`
}
