import { Clock3, Eye, RotateCcw } from 'lucide-react'

import MdxRenderer from '@/components/tests/MdxRenderer'
import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'
import { cn } from '@/lib/utils/cn'

import { QuestionAnswerReview } from './QuestionAnswerReview'
import {
	formatDuration,
	getQuestionStatus,
	getStatusClass,
	getStatusLabel,
	type QuestionResult,
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
	results: QuestionResult[]
}) {
	if (questions.length === 0) {
		return (
			<section className="border-border/80 bg-card/90 rounded-4xl p-unit-mob tab-sm:p-unit border">
				<p className="text-muted-foreground">В выбранном фильтре нет вопросов.</p>
			</section>
		)
	}

	return (
		<div className="space-y-3">
			{questions.map((question) => {
				const index = allQuestions.findIndex((item) => item.id === question.id)
				const result = results.find((item) => item.questionId === question.id)
				const status = getQuestionStatus(question.id, results)
				const telemetry = attempt.telemetry?.[question.id]
				const studentAnswer = attempt.answers[question.id]

				return (
					<section
						key={question.id}
						id={`question-${index}`}
						className="rounded-4xl border-border/80 bg-card/90 p-unit-mob tab-sm:p-unit scroll-mt-6 border"
					>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-3">
								<span className="bg-secondary/70 inline-flex size-10 items-center justify-center rounded-full font-serif text-xl">
									{index + 1}
								</span>
								<span className={cn('rounded-full border px-3 py-1 text-sm', getStatusClass(status))}>
									{getStatusLabel(status)}
								</span>
							</div>
							{result ? (
								<span className="bg-secondary/70 text-muted-foreground rounded-full px-3 py-1 text-sm">
									{result.earnedPoints} / {result.points} балл.
								</span>
							) : null}
						</div>

						<div className="mt-6">
							<MdxRenderer
								source={question.promptText}
								className="prose prose-p:my-0 prose-p:text-foreground max-w-none text-base font-medium"
							/>
						</div>

						<QuestionAnswerReview
							question={question}
							studentAnswer={studentAnswer}
							correctAnswer={result?.correctAnswer}
							isCorrect={result?.isCorrect ?? false}
							earnedPoints={result?.earnedPoints ?? 0}
							showCorrectAnswer={true}
						/>

						{telemetry ? (
							<div className="text-muted-foreground mt-5 flex flex-wrap gap-2 text-sm">
								<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
									<Clock3 className="size-3.5" />
									{formatDuration(telemetry.timeSpentMs)}
								</span>
								<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
									<Eye className="size-3.5" />
									{telemetry.focusLossCount} потерь фокуса
								</span>
								<span className="bg-secondary/70 inline-flex items-center gap-2 rounded-full px-3 py-1">
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
