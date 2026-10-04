import {
	answerIdList,
	computeVerdicts,
	normalizeIdRecord,
	normalizeIdValue,
	type ChoiceOptionVerdict,
	type SequencePositionVerdict,
} from '@bio-exam/exam-core'

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

export function answerIds(value: unknown): Set<string> {
	return new Set(answerIdList(value))
}

const CHOICE_ROW_STATUS: Record<ChoiceOptionVerdict['kind'], ChoiceOptionReviewStatus> = {
	selected_correct: 'correct',
	missed: 'correct',
	selected_wrong: 'incorrect-selected',
	neutral: 'neutral',
}

export function getChoiceOptionReviewRows(
	question: PublicTestQuestion,
	studentAnswer: unknown,
	correctAnswer: unknown
): ChoiceOptionReviewRow[] {
	const options = question.options ?? []
	const template = question.questionUiTemplate
	const verdicts =
		template === 'single_choice' || template === 'multi_choice'
			? computeVerdicts({ template, key: correctAnswer ?? null, answer: studentAnswer, content: { options } })
			: null
	const parts = verdicts?.template === 'single_choice' || verdicts?.template === 'multi_choice' ? verdicts.parts : []
	const statusById = new Map(parts.map((part) => [part.optionId, CHOICE_ROW_STATUS[part.kind]]))

	return options.map((option) => ({
		id: option.id,
		text: option.text,
		status: statusById.get(option.id) ?? 'neutral',
	}))
}

export type SequenceReview = {
	visible: boolean
	mistakes: number
	summaryText: string | null
	parts: SequencePositionVerdict[]
	showCells: boolean
	hasSwap: boolean
}

export function getSequenceReview(input: {
	studentAnswer: unknown
	correctAnswer: unknown
	isCorrect: boolean
}): SequenceReview {
	const visible = input.correctAnswer != null || input.isCorrect
	const key = input.correctAnswer != null ? input.correctAnswer : input.isCorrect ? input.studentAnswer : null
	const verdicts = computeVerdicts({ template: 'sequence_digits', key, answer: input.studentAnswer })
	const parts = verdicts.template === 'sequence_digits' ? verdicts.parts : []
	const mistakes = verdicts.mistakes
	return {
		visible,
		mistakes,
		summaryText: visible ? `Ошибок: ${mistakes}` : null,
		parts,
		showCells: input.correctAnswer != null && mistakes > 0 && parts.some((part) => part.given != null),
		hasSwap: parts.some((part) => part.kind === 'swapped'),
	}
}

export function sequencePositionLabel(part: SequencePositionVerdict, keyVisible: boolean): string {
	const prefix = `позиция ${part.position}: `
	const expected = keyVisible && part.expected != null ? part.expected : null
	if (part.kind === 'correct') return `${prefix}верно`
	if (part.kind === 'swapped') return `${prefix}переставлена местами с соседней`
	if (part.kind === 'extra') return `${prefix}лишняя цифра`
	if (part.kind === 'missing')
		return expected ? `${prefix}цифра пропущена, ожидалась ${expected}` : `${prefix}цифра пропущена`
	return expected ? `${prefix}неверно, ожидалась ${expected}` : `${prefix}неверно`
}

function optionText(question: PublicTestQuestion, optionId: string) {
	return question.options?.find((option) => option.id === optionId)?.text ?? optionId
}

export function formatAnswerLines(question: PublicTestQuestion, value: unknown): string[] {
	const template = question.questionUiTemplate
	const single = normalizeIdValue(value)

	if (template === 'single_choice' && single != null) {
		return [optionText(question, single)]
	}
	if (template === 'multi_choice' && Array.isArray(value)) {
		return answerIdList(value).map((item) => optionText(question, item))
	}
	if (template === 'short_text' && Array.isArray(value)) {
		const answers = answerIdList(value).filter(Boolean)
		return answers.length > 0 ? answers : ['Нет ответа']
	}
	if ((template === 'short_text' || template === 'sequence_digits') && single != null) {
		return [single || 'Нет ответа']
	}

	const pairs = template === 'matching' ? normalizeIdRecord(value) : null
	if (pairs && question.matchingPairs) {
		return question.matchingPairs.left.map((left) => {
			const right = question.matchingPairs?.right.find((item) => item.id === pairs[left.id])
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
	if (result.isCorrect) return 'correct'
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
