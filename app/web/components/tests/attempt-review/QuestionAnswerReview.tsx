import { Check, X } from 'lucide-react'

import type { PublicTestQuestion } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'

import { answerIds, formatAnswerLines, getChoiceOptionReviewRows } from './attempt-review-utils'

type Props = {
	question: PublicTestQuestion
	studentAnswer: unknown
	correctAnswer: unknown
	isCorrect: boolean
	earnedPoints: number
	showCorrectAnswer: boolean
}

function ChoiceAnswerReview({ question, studentAnswer, correctAnswer, isCorrect, showCorrectAnswer }: Props) {
	const selected = answerIds(studentAnswer)
	const rows = getChoiceOptionReviewRows(question, studentAnswer, correctAnswer)
	const keyVisible = correctAnswer != null || (showCorrectAnswer && isCorrect)
	const selectedCorrect = isCorrect
		? selected.size
		: rows.filter((row) => selected.has(row.id) && row.status === 'correct').length

	return (
		<div className="mt-4 space-y-2">
			<p className="text-muted-foreground text-sm">
				Выбрано: {selected.size}
				{keyVisible ? ` · из них верно: ${selectedCorrect} · неверно: ${selected.size - selectedCorrect}` : null}
			</p>
			<div className="space-y-2" role="list">
				{rows.map((row) => {
					const isSelected = selected.has(row.id)
					const correct = keyVisible && (row.status === 'correct' || (isCorrect && isSelected))
					const wrong = keyVisible && isSelected && row.status === 'incorrect-selected'
					const label = correct
						? isSelected
							? 'Выбран · верно'
							: 'Правильный · не выбран'
						: wrong
							? 'Выбран · неверно'
							: isSelected
								? 'Выбран'
								: null
					return (
						<div
							key={row.id}
							role="listitem"
							className={cn(
								'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
								correct && 'border-green-500/40 bg-green-50/80 text-green-900',
								wrong && 'border-red-500/40 bg-red-50/80 text-red-900',
								!correct && !wrong && 'border-border/70 bg-secondary/45 text-foreground'
							)}
						>
							{correct ? (
								<Check className="size-4 shrink-0 text-green-700" aria-hidden="true" />
							) : wrong ? (
								<X className="size-4 shrink-0 text-red-700" aria-hidden="true" />
							) : (
								<span className="border-muted-foreground/35 size-4 shrink-0 rounded-full border" aria-hidden="true" />
							)}
							<span className="min-w-0 flex-1">{row.text}</span>
							{label ? <span className="shrink-0 text-xs font-medium">{label}</span> : null}
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
	const matched = isCorrect
		? pairs.left.length
		: pairs.left.filter((left) => selected[left.id] != null && String(selected[left.id]) === String(correct[left.id]))
				.length

	return (
		<div className="mt-4 space-y-2">
			{keyVisible ? (
				<p className="text-muted-foreground text-sm">
					Верных пар: {matched} / {pairs.left.length}
				</p>
			) : null}
			<div className="space-y-2" role="list">
				{pairs.left.map((left) => {
					const chosen = selected[left.id]
					const pairCorrect =
						keyVisible && (isCorrect || (chosen != null && String(chosen) === String(correct[left.id])))
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

function TextAnswerReview({ question, studentAnswer, correctAnswer, isCorrect, earnedPoints }: Props) {
	const studentLines = formatAnswerLines(question, studentAnswer)
	const correctLines = correctAnswer == null ? [] : formatAnswerLines(question, correctAnswer)
	const sequence = question.questionUiTemplate === 'sequence_digits'
	const given = studentLines[0] === 'Нет ответа' ? '' : studentLines[0]
	const expected = correctLines[0] ?? (isCorrect ? given : '')
	const givenDigits = given.replace(/\s+/g, '')
	const expectedDigits = expected.replace(/\s+/g, '')
	const matchingPositions = [...givenDigits].filter((digit, index) => digit === expectedDigits[index]).length

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
				{sequence && (correctAnswer != null || isCorrect) ? (
					<p className="mt-2 text-xs">
						Совпало позиций: {matchingPositions} / {expectedDigits.length}
					</p>
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
