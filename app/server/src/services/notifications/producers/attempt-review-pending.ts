import { and, eq, inArray } from 'drizzle-orm'

import { notificationEvents, tests, users } from '../../../db/schema.js'
import { attemptReviewers } from '../../access-policy/index.js'
import { recordNotifications, type NotificationTx } from '../record.js'

export const ATTEMPT_REVIEW_PENDING_KIND = 'attempt.review_pending'

export const STUDENT_FALLBACK_NAME = 'Пользователь'

export function attemptReviewPendingDedupeKey(attemptId: string): string {
	return `${ATTEMPT_REVIEW_PENDING_KIND}:${attemptId}`
}

export async function recordAttemptReviewPending(
	tx: NotificationTx,
	input: { attemptId: string; testId: string }
): Promise<number> {
	const found = await attemptReviewers(tx, input.attemptId)
	if (!found || found.reviewerIds.length === 0) return 0
	const dedupeKey = attemptReviewPendingDedupeKey(input.attemptId)
	const notified = await tx
		.select({ recipientId: notificationEvents.recipientId })
		.from(notificationEvents)
		.where(and(eq(notificationEvents.dedupeKey, dedupeKey), inArray(notificationEvents.recipientId, found.reviewerIds)))
	const taken = new Set(notified.map((row) => row.recipientId))
	const recipientIds = found.reviewerIds.filter((id) => !taken.has(id))
	if (recipientIds.length === 0) return 0
	const [student] = await tx
		.select({ name: users.name, firstName: users.firstName })
		.from(users)
		.where(eq(users.id, found.studentId))
		.limit(1)
	const [test] = await tx.select({ title: tests.title }).from(tests).where(eq(tests.id, input.testId)).limit(1)
	const params = {
		studentName: student?.name ?? student?.firstName ?? STUDENT_FALLBACK_NAME,
		testTitle: test?.title ?? '',
	}
	await recordNotifications(
		tx,
		recipientIds.map((recipientId) => ({
			recipientId,
			actorId: found.studentId,
			kind: ATTEMPT_REVIEW_PENDING_KIND,
			subject: { type: 'attempt', id: input.attemptId },
			dedupeKey,
			params,
		}))
	)
	return recipientIds.length
}
