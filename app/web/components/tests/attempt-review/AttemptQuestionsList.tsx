import { Clock3, Eye, KeyRound, RotateCcw } from 'lucide-react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import type { AttemptQuestionView, AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'

import { QuestionAnswerReview } from './QuestionAnswerReview'
import {
	ADMIN_REVIEW_NOTES,
	emptyQuestionView,
	formatDuration,
	getAdminReviewNote,
	getQuestionPointsLabel,
	getQuestionView,
	getStatusClass,
	getStatusLabel,
} from './attempt-review-utils'

export function AttemptQuestionsList({
	attempt,
	questions,
	allQuestions,
	results,
}: {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
	allQuestions: PublicTestQuestion[]
	results: AttemptQuestionView[]
}) {
	if (questions.length === 0) {
		return (
			<section className="rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit">
				<p className="text-muted-foreground">В выбранном фильтре нет вопросов.</p>
			</section>
		)
	}

	return (
		<div className="space-y-3">
			{questions.map((question) => {
				const index = allQuestions.findIndex((item) => item.id === question.id)
				const view = getQuestionView(question.id, results)
				const status = view?.status ?? null
				const note = getAdminReviewNote(view)
				const telemetry = attempt.telemetry?.[question.id]
				const studentAnswer = attempt.answers[question.id]

				return (
					<section
						key={question.id}
						id={`question-${index}`}
						className="scroll-mt-6 rounded-4xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit"
					>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<span className="inline-flex size-10 items-center justify-center rounded-full bg-secondary/70 font-serif text-xl">
									{index + 1}
								</span>
								<span className={cn('rounded-full border px-3 py-1 text-sm', getStatusClass(status))}>
									{getStatusLabel(status)}
								</span>
							</div>
							{view ? (
								<span className="rounded-full bg-secondary/70 px-3 py-1 text-sm text-muted-foreground">
									{getQuestionPointsLabel(view)}
								</span>
							) : null}
						</div>

						<div className="mt-6">
							<MdxRenderer
								source={question.promptText}
								className="prose max-w-none text-base font-medium prose-p:my-0 prose-p:text-foreground"
							/>
						</div>

						<QuestionAnswerReview
							question={question}
							studentAnswer={studentAnswer}
							view={view ?? emptyQuestionView(question.id)}
						/>

						{note ? (
							<p
								role="note"
								className="mt-4 flex items-start gap-2 rounded-2xl border border-dashed border-border/70 bg-secondary/45 px-4 py-3 text-sm text-muted-foreground"
							>
								<KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
								<span>{ADMIN_REVIEW_NOTES[note]}</span>
							</p>
						) : null}

						{telemetry ? (
							<div className="mt-5 flex flex-wrap gap-2 text-sm text-muted-foreground">
								<span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1">
									<Clock3 className="size-3.5" />
									{formatDuration(telemetry.timeSpentMs)}
								</span>
								<span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1">
									<Eye className="size-3.5" />
									{telemetry.focusLossCount} потерь фокуса
								</span>
								<span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1">
									<RotateCcw className="size-3.5" />
									{telemetry.visitCount} посещений
								</span>
							</div>
						) : null}
					</section>
				)
			})}
		</div>
	)
}
