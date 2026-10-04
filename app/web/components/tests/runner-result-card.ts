export type RunnerResultCard = { label: string; className: string }

export function runnerResultCard(result: {
	isCorrect: boolean
	earnedPoints: number
	points: number
}): RunnerResultCard {
	if (result.isCorrect) {
		return { label: 'Верно', className: 'rounded border border-emerald-200 bg-emerald-50 p-3 text-sm' }
	}
	if (result.earnedPoints > 0) {
		return { label: 'Частично верно', className: 'rounded border border-amber-200 bg-amber-50 p-3 text-sm' }
	}
	return { label: 'Неверно', className: 'rounded border border-rose-200 bg-rose-50 p-3 text-sm' }
}
