import { computeVerdicts, type SequencePositionVerdict } from '@bio-exam/exam-core'

import { ArrowLeftRight, Check, Minus, X, type LucideIcon } from 'lucide-react'

import type { PublicTestQuestion } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'

import {
	answerIds,
	formatAnswerLines,
	getChoiceOptionReviewRows,
	getSequenceReview,
	sequencePositionLabel,
} from './attempt-review-utils'

type Props = {
	question: PublicTestQuestion
	studentAnswer: unknown
	correctAnswer: unknown
	isCorrect: boolean
	earnedPoints: number
	showCorrectAnswer: boolean
}

function choiceLabel(isSelected: boolean, correct: boolean, missed: boolean, wrong: boolean): string | null {
	if (missed) return 'Верный ответ · пропущен'
	if (correct) return 'Выбран · верно'
	if (wrong) return 'Выбран · неверно'
	return isSelected ? 'Выбран' : null
}

function ChoiceAnswerReview({ question, studentAnswer, correctAnswer, isCorrect, showCorrectAnswer }: Props) {
	const selected = answerIds(studentAnswer)
	const rows = getChoiceOptionReviewRows(question, studentAnswer, correctAnswer)
	const keyVisible = correctAnswer != null || (showCorrectAnswer && isCorrect)
	const selectedCorrect = isCorrect
		? selected.size
		: rows.filter((row) => selected.has(row.id) && row.status === 'correct').length
	const missedCorrect = keyVisible ? rows.filter((row) => !selected.has(row.id) && row.status === 'correct').length : 0

	return (
		<div className="mt-4 space-y-2">
			<p className="text-sm text-muted-foreground">
				Выбрано: {selected.size}
				{keyVisible ? ` · из них верно: ${selectedCorrect} · неверно: ${selected.size - selectedCorrect}` : null}
				{missedCorrect > 0 ? ` · пропущено верных: ${missedCorrect}` : null}
			</p>
			<div className="space-y-2" role="list">
				{rows.map((row) => {
					const isSelected = selected.has(row.id)
					const correct = keyVisible && (row.status === 'correct' || (isCorrect && isSelected))
					const missed = correct && !isSelected
					const wrong = keyVisible && isSelected && !correct
					const label = choiceLabel(isSelected, correct, missed, wrong)
					return (
						<div
							key={row.id}
							role="listitem"
							className={cn(
								'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
								correct && isSelected && 'border-green-500/40 bg-green-50/80 text-green-900',
								missed && 'border-amber-500/50 bg-amber-50/60 text-amber-950',
								wrong && 'border-red-500/40 bg-red-50/80 text-red-900',
								!correct && !wrong && 'border-border/70 bg-secondary/45 text-foreground'
							)}
						>
							{isSelected ? (
								<span
									className={cn(
										'flex size-4 shrink-0 items-center justify-center rounded-sm',
										correct ? 'bg-green-700' : wrong ? 'bg-red-700' : 'bg-foreground'
									)}
									aria-hidden="true"
								>
									<Check className="size-3 text-white" />
								</span>
							) : (
								<span className="size-4 shrink-0 rounded-sm border border-muted-foreground/50" aria-hidden="true" />
							)}
							<span className="min-w-0 flex-1">{row.text}</span>
							{label ? (
								<span
									className={cn(
										'max-w-[45%] rounded-full px-3 py-1 text-right text-xs font-medium',
										missed && 'bg-amber-100 text-amber-900',
										correct && isSelected && 'bg-green-100 text-green-900',
										wrong && 'bg-red-100 text-red-900'
									)}
								>
									{label}
								</span>
							) : null}
						</div>
					)
				})}
			</div>
		</div>
	)
}

function answerMap(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function MatchingAnswerReview({ question, studentAnswer, correctAnswer, isCorrect, showCorrectAnswer }: Props) {
	const pairs = question.matchingPairs
	if (!pairs) return null
	const selected = answerMap(studentAnswer)
	const correct = answerMap(correctAnswer)
	const keyVisible = correctAnswer != null || (showCorrectAnswer && isCorrect)
	const rightText = (value: unknown) => pairs.right.find((item) => item.id === String(value))?.text ?? 'Нет ответа'
	const verdicts = computeVerdicts({
		template: 'matching',
		key: correctAnswer ?? null,
		answer: studentAnswer,
		content: { matchingPairs: pairs },
	})
	const correctLeftIds = new Set(
		verdicts.template === 'matching'
			? verdicts.parts.filter((part) => part.kind === 'correct').map((part) => part.leftId)
			: []
	)
	const matched = isCorrect ? pairs.left.length : pairs.left.filter((left) => correctLeftIds.has(left.id)).length

	return (
		<div className="mt-4 space-y-2">
			{keyVisible ? (
				<p className="text-sm text-muted-foreground">
					Верных пар: {matched} / {pairs.left.length}
				</p>
			) : null}
			<div className="space-y-2" role="list">
				{pairs.left.map((left) => {
					const chosen = selected[left.id]
					const pairCorrect = keyVisible && (isCorrect || correctLeftIds.has(left.id))
					return (
						<div
							key={left.id}
							role="listitem"
							className={cn(
								'rounded-2xl border px-4 py-3 text-sm',
								pairCorrect && 'border-green-500/40 bg-green-50/80',
								keyVisible && !pairCorrect && 'border-red-500/40 bg-red-50/80',
								!keyVisible && 'border-border/70 bg-secondary/45'
							)}
						>
							<p>
								{left.text} → {rightText(chosen)}
							</p>
							{keyVisible ? (
								<p className="mt-1 text-xs">
									{pairCorrect ? 'Верно' : `Неверно · правильная пара: ${rightText(correct[left.id])}`}
								</p>
							) : null}
						</div>
					)
				})}
			</div>
		</div>
	)
}

const POSITION_CELL: Record<SequencePositionVerdict['kind'], { className: string; Icon: LucideIcon }> = {
	correct: { className: 'border-green-500/40 bg-green-50/80 text-green-900', Icon: Check },
	swapped: { className: 'border-amber-500/50 bg-amber-50/60 text-amber-950', Icon: ArrowLeftRight },
	wrong: { className: 'border-red-500/40 bg-red-50/80 text-red-900', Icon: X },
	extra: { className: 'border-red-500/40 bg-red-50/80 text-red-900', Icon: X },
	missing: { className: 'border-dashed border-red-500/40 bg-red-50/80 text-red-900', Icon: Minus },
}

function SequencePositionCells({ parts, keyVisible }: { parts: SequencePositionVerdict[]; keyVisible: boolean }) {
	return (
		<div role="list" aria-label="Разбор по позициям" className="mt-3 flex flex-wrap gap-2">
			{parts.map((part) => {
				const { className, Icon } = POSITION_CELL[part.kind]
				return (
					<div
						key={part.position}
						role="listitem"
						className={cn(
							'inline-flex size-10 items-center justify-center gap-1 rounded-xl border font-mono text-base font-medium',
							className
						)}
					>
						<span aria-hidden="true">{part.kind === 'missing' ? '—' : part.given}</span>
						<Icon className="size-3" aria-hidden="true" />
						<span className="sr-only">{sequencePositionLabel(part, keyVisible)}</span>
					</div>
				)
			})}
		</div>
	)
}

function TextAnswerReview({ question, studentAnswer, correctAnswer, isCorrect, earnedPoints }: Props) {
	const studentLines = formatAnswerLines(question, studentAnswer)
	const correctLines = correctAnswer == null ? [] : formatAnswerLines(question, correctAnswer)
	const sequenceReview =
		question.questionUiTemplate === 'sequence_digits'
			? getSequenceReview({ studentAnswer, correctAnswer, isCorrect })
			: null

	return (
		<div className="mt-4 grid gap-3 sm:grid-cols-2">
			<div
				className={cn(
					'rounded-2xl border p-4 text-sm',
					isCorrect
						? 'border-green-500/40 bg-green-50/80'
						: correctAnswer == null
							? 'border-border/70 bg-secondary/55'
							: earnedPoints > 0
								? 'border-amber-500/40 bg-amber-50/80'
								: 'border-red-500/40 bg-red-50/80'
				)}
			>
				<p className="mb-2 font-medium">
					Ответ студента
					{isCorrect ? ' · верно' : correctAnswer == null ? '' : earnedPoints > 0 ? ' · частично' : ' · неверно'}
				</p>
				{studentLines.map((line, index) => (
					<p key={index}>{line}</p>
				))}
				{sequenceReview?.summaryText != null ? <p className="mt-2 text-xs">{sequenceReview.summaryText}</p> : null}
				{sequenceReview?.summaryText != null && sequenceReview.hasSwap ? (
					<p className="mt-1 text-xs">Соседняя перестановка считается одной ошибкой.</p>
				) : null}
				{sequenceReview?.showCells ? (
					<SequencePositionCells parts={sequenceReview.parts} keyVisible={correctAnswer != null} />
				) : null}
			</div>
			{correctAnswer != null && !isCorrect ? (
				<div className="rounded-2xl border border-green-500/40 bg-green-50/80 p-4 text-sm">
					<p className="mb-2 font-medium">Правильный ответ</p>
					{correctLines.map((line, index) => (
						<p key={index}>{line}</p>
					))}
				</div>
			) : null}
		</div>
	)
}

export function QuestionAnswerReview(props: Props) {
	const template = props.question.questionUiTemplate
	if (template === 'single_choice' || template === 'multi_choice') return <ChoiceAnswerReview {...props} />
	if (template === 'matching') return <MatchingAnswerReview {...props} />
	return <TextAnswerReview {...props} />
}
