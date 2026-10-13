import { UPLOAD_WINDOW_ERROR_CODES, UPLOAD_WINDOW_REFUSAL_STATUS, type UploadWindowRefusal } from '@bio-exam/exam-core'

import { eq, sql } from 'drizzle-orm'

import type { DB } from '../../db/index.js'
import { testAttempts, testSessions, tests } from '../../db/schema.js'

type UploadWindowTx = Parameters<Parameters<DB['transaction']>[0]>[0]

export type UploadWindowExecutor = DB | UploadWindowTx

export type UploadWindowInput = {
	now: Date
	startedAt: Date
	timeLimitMinutes: number | null
	windowMinutes: number
	submittedAt: Date | null
	closedAt: Date | null
	uploadClosesAt: Date | null
}

export type UploadWindowState =
	| { open: true; closesAt: Date | null }
	| { open: false; reason: 'session_closed' | 'no_window' | 'window_closed'; closesAt: Date | null }

const MINUTE_MS = 60_000

export function uploadWindowState(input: UploadWindowInput): UploadWindowState {
	if (input.closedAt && !input.submittedAt) {
		return { open: false, reason: 'session_closed', closesAt: null }
	}
	if (input.submittedAt) {
		if (!input.uploadClosesAt) return { open: false, reason: 'no_window', closesAt: null }
		if (input.now.getTime() < input.uploadClosesAt.getTime()) return { open: true, closesAt: input.uploadClosesAt }
		return { open: false, reason: 'window_closed', closesAt: input.uploadClosesAt }
	}
	if (input.timeLimitMinutes === null) return { open: true, closesAt: null }
	const closesAt = new Date(input.startedAt.getTime() + (input.timeLimitMinutes + input.windowMinutes) * MINUTE_MS)
	if (input.now.getTime() < closesAt.getTime()) return { open: true, closesAt }
	return { open: false, reason: 'window_closed', closesAt }
}

export async function photoUploadWindow(
	executor: UploadWindowExecutor,
	params: { sessionId: string }
): Promise<UploadWindowState | null> {
	const [row] = await executor
		.select({
			startedAt: testSessions.startedAt,
			submittedAt: testSessions.submittedAt,
			closedAt: testSessions.closedAt,
			timeLimitMinutes: tests.timeLimitMinutes,
			windowMinutes: tests.photoUploadWindowMinutes,
			uploadClosesAt: testAttempts.uploadClosesAt,
			dbNow: sql<string>`clock_timestamp()`,
		})
		.from(testSessions)
		.innerJoin(tests, eq(tests.id, testSessions.testId))
		.leftJoin(testAttempts, eq(testAttempts.id, testSessions.attemptId))
		.where(eq(testSessions.id, params.sessionId))
	if (!row) return null
	return uploadWindowState({
		now: new Date(row.dbNow),
		startedAt: row.startedAt,
		timeLimitMinutes: row.timeLimitMinutes,
		windowMinutes: row.windowMinutes,
		submittedAt: row.submittedAt,
		closedAt: row.closedAt,
		uploadClosesAt: row.uploadClosesAt,
	})
}

export function uploadWindowRefusal(
	state: UploadWindowState
): { status: typeof UPLOAD_WINDOW_REFUSAL_STATUS; body: UploadWindowRefusal } | null {
	if (state.open) return null
	if (state.reason === 'window_closed') {
		return {
			status: UPLOAD_WINDOW_REFUSAL_STATUS,
			body: {
				error: UPLOAD_WINDOW_ERROR_CODES.closed,
				uploadClosesAt: state.closesAt ? state.closesAt.toISOString() : null,
			},
		}
	}
	return {
		status: UPLOAD_WINDOW_REFUSAL_STATUS,
		body: { error: UPLOAD_WINDOW_ERROR_CODES.none, uploadClosesAt: null },
	}
}
