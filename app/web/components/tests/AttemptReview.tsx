'use client'

import { useMemo, useState } from 'react'

import { fetchAdminAttempt } from '@/lib/tests/open-review-api'
import type { AttemptReviewData, PublicTestQuestion } from '@/lib/tests/types'

import { AttemptQuestionsList } from './attempt-review/AttemptQuestionsList'
import { AttemptReviewHero } from './attempt-review/AttemptReviewHero'
import { AttemptReviewNav } from './attempt-review/AttemptReviewNav'
import { AttemptReviewSummary } from './attempt-review/AttemptReviewSummary'
import { type NavFilter, filterQuestionsByStatus } from './attempt-review/attempt-review-utils'

type Props = {
	attempt: AttemptReviewData
	questions: PublicTestQuestion[]
}

export default function AttemptReview({ attempt: initialAttempt, questions }: Props) {
	const [attempt, setAttempt] = useState(initialAttempt)
	const orderedQuestions = useMemo(() => [...questions].sort((a, b) => a.order - b.order), [questions])
	const results = attempt.results
	const [navFilter, setNavFilter] = useState<NavFilter>('all')

	const visibleQuestions = useMemo(
		() => filterQuestionsByStatus(orderedQuestions, results, navFilter),
		[navFilter, orderedQuestions, results]
	)

	const handleReviewSaved = () => {
		void fetchAdminAttempt(attempt.attemptId).then((outcome) => {
			if (outcome.ok) setAttempt(outcome.data.attempt)
		})
	}

	return (
		<div className="space-y-5">
			<AttemptReviewHero attempt={attempt} questions={orderedQuestions} results={results} />

			<div className="grid gap-5 tab:grid-cols-[1fr_16.25rem]">
				<div className="space-y-5">
					<AttemptQuestionsList
						attempt={attempt}
						questions={visibleQuestions}
						allQuestions={orderedQuestions}
						results={results}
						onReviewSaved={handleReviewSaved}
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
