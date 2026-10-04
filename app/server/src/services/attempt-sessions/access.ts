import { and, eq, exists, inArray, or, sql, type SQL } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAssignments, tests, topics } from '../../db/schema.js'
import type { TestScope } from '../access-policy/index.js'

export type AttemptTest = {
	id: string
	slug: string
	title: string
	description: string | null
	showCorrectAnswer: boolean
	timeLimitMinutes: number | null
	passingScore: number | null
	topicId: string
	topicSlug: string
	topicTitle: string
}

export type AttemptAccess = { ok: true; test: AttemptTest } | { ok: false; status: 404 } | { ok: false; status: 403 }

export type AttemptAccessParams = {
	testId: string
	userId: string
	canReadTest: () => Promise<boolean>
}

export async function findVisibleTest(testId: string): Promise<AttemptTest | null> {
	const rows = await db
		.select({
			id: tests.id,
			slug: tests.slug,
			title: tests.title,
			description: tests.description,
			showCorrectAnswer: tests.showCorrectAnswer,
			timeLimitMinutes: tests.timeLimitMinutes,
			passingScore: tests.passingScore,
			topicId: topics.id,
			topicSlug: topics.slug,
			topicTitle: topics.title,
		})
		.from(tests)
		.innerJoin(topics, eq(tests.topicId, topics.id))
		.where(and(eq(tests.id, testId), eq(tests.isPublished, true), eq(topics.isActive, true)))
		.limit(1)
	return rows[0] ?? null
}

export async function isAssignedOrPrivileged({ testId, userId, canReadTest }: AttemptAccessParams): Promise<boolean> {
	if (await canReadTest()) return true
	const rows = await db
		.select({ testId: testAssignments.testId })
		.from(testAssignments)
		.where(and(eq(testAssignments.testId, testId), eq(testAssignments.userId, userId)))
		.limit(1)
	return rows.length > 0
}

export async function checkAttemptAccess(params: AttemptAccessParams): Promise<AttemptAccess> {
	const test = await findVisibleTest(params.testId)
	if (!test) return { ok: false, status: 404 }
	if (!(await isAssignedOrPrivileged(params))) return { ok: false, status: 403 }
	return { ok: true, test }
}

export function visibleTestsFilter({ userId, scope }: { userId: string; scope: TestScope }): SQL | undefined {
	if (scope.all) return undefined
	const assigned = exists(
		db
			.select({ one: sql`1` })
			.from(testAssignments)
			.where(and(eq(testAssignments.testId, tests.id), eq(testAssignments.userId, userId)))
	)
	if (scope.topicIds.length === 0) return assigned
	return or(assigned, inArray(tests.topicId, scope.topicIds))
}
