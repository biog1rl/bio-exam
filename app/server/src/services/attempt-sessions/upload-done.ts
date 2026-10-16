import type { UploadWindowRefusal } from '@bio-exam/exam-core'

import { eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAttempts, testSessions } from '../../db/schema.js'
import type { SessionOwner } from './outcome.js'
import { sessionFilter } from './sessions.js'
import { photoUploadWindow, uploadWindowRefusal } from './upload-window.js'

export type CloseUploadWindowOutcome =
	| { kind: 'closed'; uploadClosesAt: Date }
	| { kind: 'window'; status: 422; body: UploadWindowRefusal }
	| { kind: 'not_submitted' }
	| { kind: 'not_found' }

export async function closeUploadWindow(owner: SessionOwner, sessionId: string): Promise<CloseUploadWindowOutcome> {
	return db.transaction(async (tx): Promise<CloseUploadWindowOutcome> => {
		const [session] = await tx
			.select({ attemptId: testSessions.attemptId })
			.from(testSessions)
			.where(sessionFilter({ sessionId, owner }))
			.for('update')
		if (!session) return { kind: 'not_found' }

		const state = await photoUploadWindow(tx, { sessionId })
		if (state === null) return { kind: 'not_found' }
		const refusal = uploadWindowRefusal(state)
		if (refusal) return { kind: 'window', ...refusal }
		if (!session.attemptId) return { kind: 'not_submitted' }

		const [closed] = await tx
			.update(testAttempts)
			.set({ uploadClosesAt: sql`clock_timestamp()` })
			.where(eq(testAttempts.id, session.attemptId))
			.returning({ uploadClosesAt: testAttempts.uploadClosesAt })
		if (!closed?.uploadClosesAt) throw new Error('closeUploadWindow: окно не закрыто')
		return { kind: 'closed', uploadClosesAt: closed.uploadClosesAt }
	})
}
