'use client'

import MdxRenderer from '@/components/tests/MdxRenderer'
import { AttemptReviewHero } from '@/components/tests/attempt-review/AttemptReviewHero'
import { AttemptReviewSummary } from '@/components/tests/attempt-review/AttemptReviewSummary'
import { QuestionAnswerReview } from '@/components/tests/attempt-review/QuestionAnswerReview'
import {
	emptyQuestionView,
	getQuestionPointsLabel,
	getQuestionView,
	getStatusClass,
	getStatusLabel,
} from '@/components/tests/attempt-review/attempt-review-utils'
import { questionsInAttempt, reviewDataOf, type StudentAttemptData } from '@/lib/tests/student-attempt'
import { cn } from '@/lib/utils/cn'

import { StudentOpenAnswer } from './StudentOpenAnswer'

export function StudentAttemptResult({ attempt, test, questions, photos }: StudentAttemptData) {
	const shown = questionsInAttempt(attempt, questions)
	const results = attempt.results
	const reviewData = reviewDataOf(attempt, test.id)

	return (
		<div className="space-y-5">
			<AttemptReviewHero attempt={reviewData} questions={shown} results={results} />

			<div className="space-y-3">
				{shown.map((question, index) => {
					const view = getQuestionView(question.id, results)
					const status = view?.status ?? null
					const isOpen = question.questionUiTemplate === 'open'

					return (
						<section
							key={question.id}
							id={`question-${index}`}
							className="scroll-mt-6 rounded-3xl border border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit"
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

							{isOpen ? (
								<StudentOpenAnswer view={view ?? emptyQuestionView(question.id)} photos={photos[question.id] ?? []} />
							) : (
								<>
									<QuestionAnswerReview
										question={question}
										studentAnswer={view?.userAnswer}
										view={view ?? emptyQuestionView(question.id)}
									/>
									{view?.explanationText ? (
										<MdxRenderer
											source={view.explanationText}
											className="prose mt-4 max-w-none text-sm whitespace-normal"
										/>
									) : null}
								</>
							)}
						</section>
					)
				})}
			</div>

			<AttemptReviewSummary attempt={reviewData} questions={shown} results={results} />
		</div>
	)
}
