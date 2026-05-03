import type { PublicTestQuestion, QuestionTelemetry } from '@/lib/tests/types'

export type QuestionResult = {
	questionId: string
	isCorrect: boolean
	points: number
	earnedPoints: number
	correctAnswer?: unknown
}

export type QuestionStatus = 'correct' | 'partial' | 'wrong' | null
export type NavFilter = 'all' | 'correct' | 'partial' | 'wrong'

export const NAV_FILTERS: { value: NavFilter; label: string; dotClass: string }[] = [
	{ value: 'all', label: 'Все', dotClass: 'bg-muted-foreground/35' },
	{ value: 'correct', label: 'Верно', dotClass: 'bg-green-500' },
	{ value: 'partial', label: 'Частично', dotClass: 'bg-amber-400' },
	{ value: 'wrong', label: 'Неверно', dotClass: 'bg-red-500' },
]

export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	if (seconds < 60) return `${seconds}с`
	const minutes = Math.floor(seconds / 60)
	const rest = seconds % 60
	return `${minutes}м ${rest}с`
}

export function formatAttemptDate(value?: string): string {
	if (!value) return 'нет даты'
	return new Intl.DateTimeFormat('ru-RU', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value))
}

export function getQuestionStatus(questionId: string, results: QuestionResult[]): QuestionStatus {
	const result = results.find((item) => item.questionId === questionId)
	if (!result || result.points === 0) return null
	if (result.earnedPoints === result.points) return 'correct'
	if (result.earnedPoints > 0) return 'partial'
	return 'wrong'
}

export function getStatusLabel(status: QuestionStatus) {
	if (status === 'correct') return 'Верно'
	if (status === 'partial') return 'Частично'
	if (status === 'wrong') return 'Неверно'
	return 'Без оценки'
}

export function getStatusClass(status: QuestionStatus) {
	if (status === 'correct') return 'border-green-500/45 bg-green-50/80 text-green-700'
	if (status === 'partial') return 'border-amber-500/45 bg-amber-50/80 text-amber-700'
	if (status === 'wrong') return 'border-red-500/45 bg-red-50/80 text-red-700'
	return 'border-border/70 bg-secondary/60 text-muted-foreground'
}

export function getStatusDotClass(status: QuestionStatus) {
	if (status === 'correct') return 'bg-green-500'
	if (status === 'partial') return 'bg-amber-400'
	if (status === 'wrong') return 'bg-red-500'
	return 'bg-muted-foreground/35'
}

export function getAttemptTelemetryStats(
	telemetry: Record<string, QuestionTelemetry> | null,
	questions: PublicTestQuestion[]
) {
	if (!telemetry) return null
	const rows = questions
		.map((question) => telemetry[question.id])
		.filter((row): row is QuestionTelemetry => Boolean(row))
	if (rows.length === 0) return null

	const totalMs = rows.reduce((sum, row) => sum + row.timeSpentMs, 0)
	const avgMs = Math.round(totalMs / rows.length)
	const focusLossCount = rows.reduce((sum, row) => sum + row.focusLossCount, 0)
	const visitCount = rows.reduce((sum, row) => sum + row.visitCount, 0)

	return { totalMs, avgMs, focusLossCount, visitCount }
}

export function scrollToAttemptSection(id: string) {
	document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
