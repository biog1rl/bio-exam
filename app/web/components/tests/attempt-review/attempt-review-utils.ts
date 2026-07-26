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

export type ChoiceOptionReviewStatus = 'correct' | 'incorrect-selected' | 'neutral'

export type ChoiceOptionReviewRow = {
	id: string
	text: string
	status: ChoiceOptionReviewStatus
}

function answerIds(value: unknown): Set<string> {
	if (Array.isArray(value)) {
		return new Set(
			value.filter((item) => typeof item === 'string' || typeof item === 'number').map((item) => String(item))
		)
	}
	if (typeof value === 'string' || typeof value === 'number') {
		return new Set([String(value)])
	}
	return new Set()
}

export function getChoiceOptionReviewRows(
	question: PublicTestQuestion,
	studentAnswer: unknown,
	correctAnswer: unknown
): ChoiceOptionReviewRow[] {
	const selectedIds = answerIds(studentAnswer)
	const correctIds = answerIds(correctAnswer)

	return (question.options ?? []).map((option) => ({
		id: option.id,
		text: option.text,
		status: correctIds.has(option.id) ? 'correct' : selectedIds.has(option.id) ? 'incorrect-selected' : 'neutral',
	}))
}

function optionText(question: PublicTestQuestion, optionId: string) {
	return question.options?.find((option) => option.id === optionId)?.text ?? optionId
}

export function formatAnswerLines(question: PublicTestQuestion, value: unknown): string[] {
	const template = question.questionUiTemplate

	if (template === 'single_choice' && (typeof value === 'string' || typeof value === 'number')) {
		return [optionText(question, String(value))]
	}
	if (template === 'multi_choice' && Array.isArray(value)) {
		return value.map((item) => optionText(question, String(item)))
	}
	if (template === 'short_text' && Array.isArray(value)) {
		const answers = value
			.filter((item) => typeof item === 'string' || typeof item === 'number')
			.map((item) => String(item))
			.filter(Boolean)
		return answers.length > 0 ? answers : ['Нет ответа']
	}
	if (
		(template === 'short_text' || template === 'sequence_digits') &&
		(typeof value === 'string' || typeof value === 'number')
	) {
		return [String(value) || 'Нет ответа']
	}

	if (
		template === 'matching' &&
		value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		question.matchingPairs
	) {
		const map = value as Record<string, string | number>
		return question.matchingPairs.left.map((left) => {
			const right = question.matchingPairs?.right.find((item) => item.id === String(map[left.id]))
			return `${left.text} -> ${right?.text ?? 'нет ответа'}`
		})
	}

	return ['Нет ответа']
}

export function formatDuration(ms: number): string {
	if (ms > 0 && ms < 1000) return '<1с'
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
