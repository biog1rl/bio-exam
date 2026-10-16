import type { QuestionStatus } from '@bio-exam/exam-core'

export type RunnerResultCard = { label: string; className: string }

const CARDS: Record<QuestionStatus, RunnerResultCard> = {
	correct: { label: 'Верно', className: 'rounded-md border border-success-border bg-success-soft p-3 text-sm' },
	partial: {
		label: 'Частично верно',
		className: 'rounded-md border border-warning-border bg-warning-soft p-3 text-sm',
	},
	wrong: { label: 'Неверно', className: 'rounded-md border border-destructive-border bg-destructive-soft p-3 text-sm' },
	pending: {
		label: 'На проверке',
		className: 'rounded-md border border-border/70 bg-secondary p-3 text-sm text-secondary-foreground',
	},
	ungraded: { label: 'Без оценки', className: 'rounded-md border bg-muted/30 p-3 text-sm' },
}

export function runnerResultCard(status: QuestionStatus | undefined): RunnerResultCard {
	const card = status && Object.hasOwn(CARDS, status) ? CARDS[status] : CARDS.ungraded
	return { ...card }
}
