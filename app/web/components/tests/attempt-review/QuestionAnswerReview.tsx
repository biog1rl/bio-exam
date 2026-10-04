import type { SequencePositionVerdict } from '@bio-exam/exam-core'

import { ArrowLeftRight, Check, Minus, X, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

import {
	getChoiceReview,
	getCorrectLines,
	getMatchingReview,
	getTextReview,
	sequencePositionLabel,
	type ChoiceReviewModel,
	type MatchingReviewModel,
	type ReviewInput,
	type TextReviewModel,
} from './attempt-review-utils'

type Props = ReviewInput

const CHOICE_ROW_CLASS: Record<ChoiceReviewModel['rows'][number]['tone'], string> = {
	correct: 'border-green-500/40 bg-green-50/80 text-green-900',
	missed: 'border-amber-500/50 bg-amber-50/60 text-amber-950',
	wrong: 'border-red-500/40 bg-red-50/80 text-red-900',
	neutral: 'border-border/70 bg-secondary/45 text-foreground',
}

const CHOICE_LABEL_CLASS: Record<ChoiceReviewModel['rows'][number]['tone'], string | null> = {
	correct: 'bg-green-100 text-green-900',
	missed: 'bg-amber-100 text-amber-900',
	wrong: 'bg-red-100 text-red-900',
	neutral: null,
}

function CorrectAnswerCard({ lines, className }: { lines: string[]; className?: string }) {
	return (
		<div className={cn('rounded-2xl border border-green-500/40 bg-green-50/80 p-4 text-sm', className)}>
			<p className="mb-2 font-medium">Правильный ответ</p>
			{lines.map((line, index) => (
				<p key={index}>{line}</p>
			))}
		</div>
	)
}

function KeyCard(props: Props) {
	const lines = getCorrectLines(props.question, props.view)
	return lines ? <CorrectAnswerCard lines={lines} className="mt-4" /> : null
}

function ChoiceAnswerReview(props: Props) {
	const review = getChoiceReview(props)

	return (
		<div className="mt-4 space-y-2">
			<p className="text-sm text-muted-foreground">{review.summary}</p>
			<div className="space-y-2" role="list">
				{review.rows.map((row) => (
					<div
						key={row.id}
						role="listitem"
						className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm', CHOICE_ROW_CLASS[row.tone])}
					>
						{row.selected ? (
							<span
								className={cn(
									'flex size-4 shrink-0 items-center justify-center rounded-sm',
									row.tone === 'correct' ? 'bg-green-700' : row.tone === 'wrong' ? 'bg-red-700' : 'bg-foreground'
								)}
								aria-hidden="true"
							>
								<Check className="size-3 text-white" />
							</span>
						) : (
							<span className="size-4 shrink-0 rounded-sm border border-muted-foreground/50" aria-hidden="true" />
						)}
						<span className="min-w-0 flex-1">{row.text}</span>
						{row.label ? (
							<span
								className={cn(
									'max-w-[45%] rounded-full px-3 py-1 text-right text-xs font-medium',
									CHOICE_LABEL_CLASS[row.tone]
								)}
							>
								{row.label}
							</span>
						) : null}
					</div>
				))}
			</div>
		</div>
	)
}

const MATCHING_ROW_CLASS: Record<MatchingReviewModel['rows'][number]['tone'], string> = {
	correct: 'border-green-500/40 bg-green-50/80',
	wrong: 'border-red-500/40 bg-red-50/80',
	neutral: 'border-border/70 bg-secondary/45',
}

function MatchingAnswerReview(props: Props) {
	const review = getMatchingReview(props)
	if (!review) return null

	return (
		<div className="mt-4 space-y-2">
			{review.summary != null ? <p className="text-sm text-muted-foreground">{review.summary}</p> : null}
			<div className="space-y-2" role="list">
				{review.rows.map((row) => (
					<div
						key={row.leftId}
						role="listitem"
						className={cn('rounded-2xl border px-4 py-3 text-sm', MATCHING_ROW_CLASS[row.tone])}
					>
						<p>{row.text}</p>
						{row.verdictText != null ? <p className="mt-1 text-xs">{row.verdictText}</p> : null}
					</div>
				))}
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

const STUDENT_TONE_CLASS: Record<TextReviewModel['studentTone'], string> = {
	correct: 'border-green-500/40 bg-green-50/80',
	neutral: 'border-border/70 bg-secondary/55',
	partial: 'border-amber-500/40 bg-amber-50/80',
	wrong: 'border-red-500/40 bg-red-50/80',
}

function TextAnswerReview(props: Props) {
	const review = getTextReview(props)

	return (
		<div className="mt-4 grid gap-3 sm:grid-cols-2">
			<div className={cn('rounded-2xl border p-4 text-sm', STUDENT_TONE_CLASS[review.studentTone])}>
				<p className="mb-2 font-medium">{review.studentTitle}</p>
				{review.studentLines.map((line, index) => (
					<p key={index}>{line}</p>
				))}
				{review.summaryText != null ? <p className="mt-2 text-xs">{review.summaryText}</p> : null}
				{review.swapHint ? <p className="mt-1 text-xs">Соседняя перестановка считается одной ошибкой.</p> : null}
				{review.cells ? <SequencePositionCells parts={review.cells} keyVisible={review.cellsKeyVisible} /> : null}
			</div>
			{review.correctLines ? <CorrectAnswerCard lines={review.correctLines} /> : null}
		</div>
	)
}

export function QuestionAnswerReview(props: Props) {
	const template = props.question.questionUiTemplate
	if (template === 'single_choice' || template === 'multi_choice') {
		return (
			<>
				<ChoiceAnswerReview {...props} />
				<KeyCard {...props} />
			</>
		)
	}
	if (template === 'matching') {
		return (
			<>
				<MatchingAnswerReview {...props} />
				<KeyCard {...props} />
			</>
		)
	}
	return <TextAnswerReview {...props} />
}
