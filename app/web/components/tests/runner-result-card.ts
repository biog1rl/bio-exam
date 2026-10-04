import type { QuestionStatus } from '@bio-exam/exam-core'

export type RunnerResultCard = { label: string; className: string }

const CARDS: Record<QuestionStatus, RunnerResultCard> = {
	correct: { label: 'Верно', className: 'rounded border border-emerald-200 bg-emerald-50 p-3 text-sm' },
	partial: { label: 'Частично верно', className: 'rounded border border-amber-200 bg-amber-50 p-3 text-sm' },
	wrong: { label: 'Неверно', className: 'rounded border border-rose-200 bg-rose-50 p-3 text-sm' },
	ungraded: { label: 'Без оценки', className: 'rounded border bg-muted/30 p-3 text-sm' },
}

export function runnerResultCard(status: QuestionStatus | undefined): RunnerResultCard {
	const card = status && Object.hasOwn(CARDS, status) ? CARDS[status] : CARDS.ungraded
	return { ...card }
}
