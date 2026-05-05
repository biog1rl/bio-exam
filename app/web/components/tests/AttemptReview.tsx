'use client'

import { useMemo, useState } from 'react'

import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'

import { AttemptQuestionsList } from './attempt-review/AttemptQuestionsList'
import { AttemptReviewHero } from './attempt-review/AttemptReviewHero'
import { AttemptReviewNav } from './attempt-review/AttemptReviewNav'
import { AttemptReviewSummary } from './attempt-review/AttemptReviewSummary'
import { type NavFilter, type QuestionResult, getQuestionStatus } from './attempt-review/attempt-review-utils'

type Props = {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
}

export default function AttemptReview({ attempt, questions }: Props) {
	const orderedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions])
	const results = useMemo(() => (attempt.results as QuestionResult[]) ?? [], [attempt.results])
	const [navFilter, setNavFilter] = useState<NavFilter>('all')

	const visibleQuestions = useMemo(() => {
		if (navFilter === 'all') return orderedQuestions
		return orderedQuestions.filter((question) => getQuestionStatus(question.id, results) === navFilter)
	}, [navFilter, orderedQuestions, results])

	return (
		<div className="space-y-5">
			<AttemptReviewHero attempt={attempt} questions={orderedQuestions} results={results} />

			<div className="tab:grid-cols-[1fr_16.25rem] grid gap-5">
				<div className="space-y-5">
					<AttemptQuestionsList
						attempt={attempt}
						questions={visibleQuestions}
						allQuestions={orderedQuestions}
						results={results}
					/>
					<AttemptReviewSummary attempt={attempt} questions={orderedQuestions} results={results} />
				</div>

				<AttemptReviewNav
					attempt={attempt}
					questions={orderedQuestions}
					results={results}
					navFilter={navFilter}
					onNavFilterChange={setNavFilter}
				/>
			</div>
		</div>
	)
}
