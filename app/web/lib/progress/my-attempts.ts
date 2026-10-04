import type { PublicTestListItem, TestAttemptSummary } from '@/lib/tests/types'

import type { ProgressAttempt } from './attempt-chart'

export const MY_ATTEMPTS_PAGE = 100

export type FetchAttemptsPage = (
	testId: string,
	options?: { offset?: number; limit?: number }
) => Promise<{ rows: TestAttemptSummary[]; total: number }>

type ProgressTest = Pick<PublicTestListItem, 'id' | 'slug' | 'title' | 'topicSlug' | 'topicTitle'>

function toProgressAttempt(test: ProgressTest, row: TestAttemptSummary): ProgressAttempt {
	return {
		attemptId: row.id,
		testId: test.id,
		testTitle: test.title,
		testSlug: test.slug,
		topicSlug: test.topicSlug,
		topicTitle: test.topicTitle,
		submittedAt: row.submittedAt,
		earnedPoints: row.earnedPoints,
		totalPoints: row.totalPoints,
		scorePercentage: row.scorePercentage,
		passed: row.passed,
	}
}

async function loadTestAttempts(test: ProgressTest, fetchPage: FetchAttemptsPage): Promise<ProgressAttempt[]> {
	const collected: ProgressAttempt[] = []
	for (;;) {
		const page = await fetchPage(test.id, { offset: collected.length, limit: MY_ATTEMPTS_PAGE })
		if (page.rows.length === 0) break
		for (const row of page.rows) collected.push(toProgressAttempt(test, row))
		if (collected.length >= page.total) break
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
