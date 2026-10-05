import { attemptResultView } from '@/lib/tests/attempt-result-view'
import type { PublicTestListItem, TestAttemptSummary } from '@/lib/tests/types'

import type { ProgressAttempt } from './attempt-chart'

export const MY_ATTEMPTS_PAGE = 100

export type FetchAttemptsPage = (
	testId: string,
	options?: { offset?: number; limit?: number }
) => Promise<{ rows: TestAttemptSummary[]; total: number }>

type ProgressTest = Pick<PublicTestListItem, 'id' | 'slug' | 'title' | 'topicSlug' | 'topicTitle'>

function toProgressAttempt(test: ProgressTest, row: TestAttemptSummary): ProgressAttempt | null {
	const view = attemptResultView(row)
	if (view.kind === 'pending') return null
	return {
		attemptId: row.id,
		testId: test.id,
		testTitle: test.title,
		testSlug: test.slug,
		topicSlug: test.topicSlug,
		topicTitle: test.topicTitle,
		submittedAt: row.submittedAt,
		earnedPoints: view.points.earned,
		totalPoints: view.points.total,
		scorePercentage: view.percent,
		passed: view.passed,
	}
}

async function loadTestAttempts(test: ProgressTest, fetchPage: FetchAttemptsPage): Promise<ProgressAttempt[]> {
	const collected: ProgressAttempt[] = []
	let fetched = 0
	for (;;) {
		const page = await fetchPage(test.id, { offset: fetched, limit: MY_ATTEMPTS_PAGE })
		if (page.rows.length === 0) break
		for (const row of page.rows) {
			const attempt = toProgressAttempt(test, row)
			if (attempt) collected.push(attempt)
		}
		fetched += page.rows.length
		if (fetched >= page.total) break
	}
	return collected
}

export async function loadMyProgressAttempts(
	tests: ProgressTest[],
	fetchPage: FetchAttemptsPage
): Promise<ProgressAttempt[]> {
	const perTest = await Promise.all(tests.map((test) => loadTestAttempts(test, fetchPage)))
	return perTest.flat()
}
