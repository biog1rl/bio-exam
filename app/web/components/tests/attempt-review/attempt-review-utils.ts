import {
	answerIdList,
	normalizeIdRecord,
	normalizeIdValue,
	type AttemptQuestionView,
	type ChoiceOptionVerdict,
	type QuestionStatus,
	type QuestionVerdicts,
	type SequencePositionVerdict,
} from '@bio-exam/exam-core'

import type { PublicTestQuestion, QuestionTelemetry } from '@/lib/tests/types'

export type NavFilter = 'all' | 'correct' | 'partial' | 'wrong' | 'pending'

export const NAV_FILTERS: { value: NavFilter; label: string; dotClass: string }[] = [
	{ value: 'all', label: 'Все', dotClass: 'bg-muted-foreground/35' },
	{ value: 'correct', label: 'Верно', dotClass: 'bg-green-500' },
	{ value: 'partial', label: 'Частично', dotClass: 'bg-amber-400' },
	{ value: 'wrong', label: 'Неверно', dotClass: 'bg-red-500' },
]

const PENDING_NAV_FILTER: (typeof NAV_FILTERS)[number] = {
	value: 'pending',
	label: 'На проверке',
	dotClass: 'bg-muted-foreground/35',
}

export function navFiltersFor(results: ReadonlyArray<AttemptQuestionView>): typeof NAV_FILTERS {
	return results.some((item) => item.status === 'pending') ? [...NAV_FILTERS, PENDING_NAV_FILTER] : NAV_FILTERS
}

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
	verdicts: QuestionVerdicts | null
): ChoiceOptionReviewRow[] {
	const options = question.options ?? []
	const parts = verdicts?.template === 'single_choice' || verdicts?.template === 'multi_choice' ? verdicts.parts : []
	const statusById = new Map(parts.map((part) => [part.optionId, CHOICE_ROW_STATUS[part.kind]]))

	return options.map((option) => ({
		id: option.id,
		text: option.text,
		status: statusById.get(option.id) ?? 'neutral',
	}))
}

export type SequenceReview = {
	summaryText: string | null
	parts: SequencePositionVerdict[]
	showCells: boolean
	hasSwap: boolean
}

export function getSequenceReview(input: {
	verdicts: QuestionVerdicts | null
	mistakes: number | null
	correctAnswer: unknown
}): SequenceReview {
	const { verdicts, mistakes, correctAnswer } = input
	const parts = verdicts?.template === 'sequence_digits' ? verdicts.parts : []
	return {
		summaryText: mistakes != null ? `Ошибок: ${mistakes}` : null,
		parts,
		showCells: correctAnswer != null && mistakes != null && mistakes > 0 && parts.some((part) => part.given != null),
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

export type ReviewInput = {
	question: PublicTestQuestion
	studentAnswer: unknown
	view: AttemptQuestionView
}

export function getQuestionView(
	questionId: string,
	results: ReadonlyArray<AttemptQuestionView>
): AttemptQuestionView | null {
	return results.find((item) => item.questionId === questionId) ?? null
}

export function emptyQuestionView(questionId: string): AttemptQuestionView {
	return {
		questionId,
		isCorrect: false,
		points: 0,
		earnedPoints: 0,
		userAnswer: null,
		correctAnswer: null,
		explanationText: null,
		status: 'ungraded',
		keyVisible: false,
		mistakes: null,
		verdicts: null,
	}
}

export function filterQuestionsByStatus<T extends Pick<PublicTestQuestion, 'id'>>(
	questions: T[],
	results: ReadonlyArray<AttemptQuestionView>,
	filter: NavFilter
): T[] {
	if (filter === 'all') return questions
	return questions.filter((question) => getQuestionView(question.id, results)?.status === filter)
}

export type AdminReviewNote = 'key-unknown' | 'verdicts-unavailable'

export const ADMIN_REVIEW_NOTES: Record<AdminReviewNote, string> = {
	'key-unknown': 'Ключ на момент сдачи не сохранён. Показаны ответ студента и сохранённые баллы.',
	'verdicts-unavailable':
		'Разбор по частям недоступен: правила проверки изменились после сдачи. Показаны ключ на момент сдачи и сохранённые баллы.',
}

export function getAdminReviewNote(view: AttemptQuestionView | null): AdminReviewNote | null {
	if (!view) return null
	if (!view.keyVisible) return 'key-unknown'
	if (view.verdicts == null) return 'verdicts-unavailable'
	return null
}

export function getCorrectLines(question: PublicTestQuestion, view: AttemptQuestionView): string[] | null {
	if (!view.keyVisible || view.verdicts != null || view.correctAnswer == null || view.status === 'correct') return null
	return formatAnswerLines(question, view.correctAnswer)
}

function verdictsShown(view: AttemptQuestionView): QuestionVerdicts | null {
	return view.keyVisible ? view.verdicts : null
}

export type TextReviewModel = {
	studentTitle: string
	studentTone: 'correct' | 'partial' | 'wrong' | 'neutral'
	studentLines: string[]
	summaryText: string | null
	swapHint: boolean
	cells: SequencePositionVerdict[] | null
	cellsKeyVisible: boolean
	correctLines: string[] | null
}

export function getTextReview(input: ReviewInput): TextReviewModel {
	const { question, studentAnswer, view } = input
	const { correctAnswer, isCorrect, earnedPoints } = view
	const sequenceReview =
		question.questionUiTemplate === 'sequence_digits'
			? getSequenceReview({ verdicts: view.verdicts, mistakes: view.mistakes, correctAnswer })
			: null
	const studentTone: TextReviewModel['studentTone'] = isCorrect
		? 'correct'
		: correctAnswer == null
			? 'neutral'
			: earnedPoints > 0
				? 'partial'
				: 'wrong'
	const suffix = isCorrect ? ' · верно' : correctAnswer == null ? '' : earnedPoints > 0 ? ' · частично' : ' · неверно'
	const summaryText = sequenceReview?.summaryText ?? null

	return {
		studentTitle: `Ответ студента${suffix}`,
		studentTone,
		studentLines: formatAnswerLines(question, studentAnswer),
		summaryText,
		swapHint: summaryText != null && sequenceReview != null && sequenceReview.hasSwap,
		cells: sequenceReview?.showCells ? sequenceReview.parts : null,
		cellsKeyVisible: correctAnswer != null,
		correctLines: correctAnswer != null && !isCorrect ? formatAnswerLines(question, correctAnswer) : null,
	}
}

export type ChoiceReviewModel = {
	summary: string
	rows: Array<{
		id: string
		text: string
		selected: boolean
		tone: 'correct' | 'missed' | 'wrong' | 'neutral'
		label: string | null
	}>
}

function choiceLabel(isSelected: boolean, correct: boolean, missed: boolean, wrong: boolean): string | null {
	if (missed) return 'Верный ответ · пропущен'
	if (correct) return 'Выбран · верно'
	if (wrong) return 'Выбран · неверно'
	return isSelected ? 'Выбран' : null
}

export function getChoiceReview(input: ReviewInput): ChoiceReviewModel {
	const { question, studentAnswer, view } = input
	const { isCorrect } = view
	const selected = answerIds(studentAnswer)
	const verdicts = verdictsShown(view)
	const rows = getChoiceOptionReviewRows(question, verdicts)
	const keyVisible = verdicts != null
	const selectedCorrect = isCorrect
		? selected.size
		: rows.filter((row) => selected.has(row.id) && row.status === 'correct').length
	const missedCorrect = keyVisible ? rows.filter((row) => !selected.has(row.id) && row.status === 'correct').length : 0
	const summary =
		`Выбрано: ${selected.size}` +
		(keyVisible ? ` · из них верно: ${selectedCorrect} · неверно: ${selected.size - selectedCorrect}` : '') +
		(missedCorrect > 0 ? ` · пропущено верных: ${missedCorrect}` : '')

	return {
		summary,
		rows: rows.map((row) => {
			const isSelected = selected.has(row.id)
			const correct = keyVisible && (row.status === 'correct' || (isCorrect && isSelected))
			const missed = correct && !isSelected
			const wrong = keyVisible && isSelected && !correct
			const tone: ChoiceReviewModel['rows'][number]['tone'] = missed
				? 'missed'
				: correct && isSelected
					? 'correct'
					: wrong
						? 'wrong'
						: 'neutral'
			return {
				id: row.id,
				text: row.text,
				selected: isSelected,
				tone,
				label: choiceLabel(isSelected, correct, missed, wrong),
			}
		}),
	}
}

export type MatchingReviewModel = {
	summary: string | null
	rows: Array<{
		leftId: string
		text: string
		tone: 'correct' | 'wrong' | 'neutral'
		verdictText: string | null
	}>
}

function answerMap(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function getMatchingReview(input: ReviewInput): MatchingReviewModel | null {
	const { question, studentAnswer, view } = input
	const { isCorrect } = view
	const pairs = question.matchingPairs
	if (!pairs) return null
	const selected = answerMap(studentAnswer)
	const verdicts = verdictsShown(view)
	const keyVisible = verdicts != null
	const rightText = (value: unknown) => pairs.right.find((item) => item.id === String(value))?.text ?? 'Нет ответа'
	const parts = verdicts?.template === 'matching' ? verdicts.parts : []
	const expectedByLeft = new Map(parts.map((part) => [part.leftId, part.expected]))
	const correctLeftIds = new Set(parts.filter((part) => part.kind === 'correct').map((part) => part.leftId))
	const matched = isCorrect ? pairs.left.length : pairs.left.filter((left) => correctLeftIds.has(left.id)).length

	return {
		summary: keyVisible ? `Верных пар: ${matched} / ${pairs.left.length}` : null,
		rows: pairs.left.map((left) => {
			const pairCorrect = keyVisible && (isCorrect || correctLeftIds.has(left.id))
			return {
				leftId: left.id,
				text: `${left.text} → ${rightText(selected[left.id])}`,
				tone: pairCorrect ? 'correct' : keyVisible ? 'wrong' : 'neutral',
				verdictText: keyVisible
					? pairCorrect
						? 'Верно'
						: `Неверно · правильная пара: ${rightText(expectedByLeft.get(left.id))}`
					: null,
			}
		}),
	}
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

export function getQuestionPointsLabel(view: Pick<AttemptQuestionView, 'status' | 'points' | 'earnedPoints'>) {
	if (view.status === 'pending') return `до ${view.points} балл.`
	return `${view.earnedPoints} / ${view.points} балл.`
}

export function getStatusLabel(status: QuestionStatus | null) {
	if (status === 'correct') return 'Верно'
	if (status === 'partial') return 'Частично'
	if (status === 'wrong') return 'Неверно'
	if (status === 'pending') return 'На проверке'
	return 'Без оценки'
}

export function getStatusClass(status: QuestionStatus | null) {
	if (status === 'correct') return 'border-green-500/45 bg-green-50/80 text-green-700'
	if (status === 'partial') return 'border-amber-500/45 bg-amber-50/80 text-amber-700'
	if (status === 'wrong') return 'border-red-500/45 bg-red-50/80 text-red-700'
	if (status === 'pending') return 'border-border/70 bg-secondary text-secondary-foreground'
	return 'border-border/70 bg-secondary/60 text-muted-foreground'
}

export function getStatusDotClass(status: QuestionStatus | null) {
	if (status === 'correct') return 'bg-green-500'
	if (status === 'partial') return 'bg-amber-400'
	if (status === 'wrong') return 'bg-red-500'
	if (status === 'pending') return 'bg-muted-foreground/35'
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
