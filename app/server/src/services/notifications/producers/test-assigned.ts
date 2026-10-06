import { eq } from 'drizzle-orm'

import { testAssignments, tests, topics } from '../../../db/schema.js'
import { recordNotifications, type NotificationInput, type NotificationTx } from '../record.js'

export const TEST_ASSIGNED_KIND = 'test.assigned'

export function testAssignedDedupeKey(testId: string): string {
	return `test.assigned:${testId}`
}

export async function visibleTestTitle(tx: NotificationTx, testId: string): Promise<string | null> {
	const [row] = await tx
		.select({ title: tests.title, isPublished: tests.isPublished, topicActive: topics.isActive })
		.from(tests)
		.innerJoin(topics, eq(topics.id, tests.topicId))
		.where(eq(tests.id, testId))
		.limit(1)
		.for('share', { of: tests })
	if (!row || !row.isPublished || !row.topicActive) return null
	return row.title
}

export function testAssignedInputs(
	testId: string,
	testTitle: string,
	actorId: string | null,
	recipientIds: readonly string[]
): NotificationInput[] {
	return recipientIds.map((recipientId) => ({
		recipientId,
		actorId,
		kind: TEST_ASSIGNED_KIND,
		subject: { type: 'test', id: testId },
		dedupeKey: testAssignedDedupeKey(testId),
		params: { testTitle },
	}))
}

export async function recordTestAssigned(
	tx: NotificationTx,
	input: { testId: string; actorId: string; recipientIds: readonly string[] }
): Promise<void> {
	const recipientIds = [...new Set(input.recipientIds)].filter((recipientId) => recipientId !== input.actorId)
	if (recipientIds.length === 0) return
	const title = await visibleTestTitle(tx, input.testId)
	if (title === null) return
	await recordNotifications(tx, testAssignedInputs(input.testId, title, input.actorId, recipientIds))
}

export async function recordTestPublished(
	tx: NotificationTx,
	input: { testId: string; actorId: string | null }
): Promise<void> {
	const title = await visibleTestTitle(tx, input.testId)
	if (title === null) return
	const rows = await tx
		.select({ userId: testAssignments.userId })
		.from(testAssignments)
		.where(eq(testAssignments.testId, input.testId))
	const recipientIds = [...new Set(rows.map((row) => row.userId))]
		.filter((recipientId) => recipientId !== input.actorId)
		.sort()
	if (recipientIds.length === 0) return
	await recordNotifications(tx, testAssignedInputs(input.testId, title, input.actorId, recipientIds))
}
