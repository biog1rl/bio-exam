import { eq } from 'drizzle-orm'

import { tests } from '../../../db/schema.js'
import { recordNotification, type NotificationTx } from '../record.js'

export const ATTEMPT_GRADED_KIND = 'attempt.graded'

export function attemptGradedDedupeKey(attemptId: string): string {
	return `attempt.graded:${attemptId}`
}

export async function recordAttemptGraded(
	tx: NotificationTx,
	input: { attemptId: string; testId: string; studentId: string; actorId: string | null }
): Promise<void> {
	const [test] = await tx.select({ title: tests.title }).from(tests).where(eq(tests.id, input.testId)).limit(1)
	await recordNotification(tx, {
		recipientId: input.studentId,
		actorId: input.actorId,
		kind: ATTEMPT_GRADED_KIND,
		subject: { type: 'attempt', id: input.attemptId },
		dedupeKey: attemptGradedDedupeKey(input.attemptId),
		params: { testTitle: test?.title ?? '' },
	})
}
