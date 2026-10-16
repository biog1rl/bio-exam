import type { QuestionPhotoSettings } from '@bio-exam/exam-core'

import { and, eq } from 'drizzle-orm'

import { questions, testSessions, users } from '../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { canUserReadTest } from '../access-policy/index.js'
import {
	checkAttemptAccess,
	photoUploadWindow,
	sessionFilter,
	type AttemptTest,
	type UploadWindowExecutor,
	type UploadWindowState,
} from '../attempt-sessions/index.js'

export type AnswerPhotoOwner = { testId: string; userId: string }

export type AnswerPhotoPlace = { owner: AnswerPhotoOwner; sessionId: string; questionId: string }

export type PhotoSlotRefusal = 'test_missing' | 'not_assigned' | 'slot_missing' | 'user_inactive'

export type PhotoSlot =
	| { kind: 'refused'; reason: PhotoSlotRefusal }
	| { kind: 'slot'; test: AttemptTest; rule: QuestionPhotoSettings; window: UploadWindowState }

function refused(reason: PhotoSlotRefusal): PhotoSlot {
	return { kind: 'refused', reason }
}

export async function readPhotoRule(
	executor: UploadWindowExecutor,
	questionId: string
): Promise<QuestionPhotoSettings | null> {
	const [row] = await executor
		.select({ allowPhotos: questions.allowPhotos, maxPhotos: questions.maxPhotos })
		.from(questions)
		.where(eq(questions.id, questionId))
		.limit(1)
	return row ?? null
}

async function ownerIsActive(executor: UploadWindowExecutor, userId: string): Promise<boolean> {
	const [row] = await executor.select({ isActive: users.isActive }).from(users).where(eq(users.id, userId)).limit(1)
	return row?.isActive === true
}

export async function readPhotoSlot(executor: UploadWindowExecutor, place: AnswerPhotoPlace): Promise<PhotoSlot> {
	const { testId, userId } = place.owner
	if (!(await ownerIsActive(executor, userId))) return refused('user_inactive')
	const access = await checkAttemptAccess({ testId, userId, canReadTest: () => canUserReadTest(userId, testId) })
	if (!access.ok) return refused(access.status === 404 ? 'test_missing' : 'not_assigned')
	const [session] = await executor
		.select({ id: testSessions.id })
		.from(testSessions)
		.where(sessionFilter({ sessionId: place.sessionId, owner: place.owner }))
		.limit(1)
	if (!session) return refused('slot_missing')
	const [question] = await executor
		.select({ type: questions.type, allowPhotos: questions.allowPhotos, maxPhotos: questions.maxPhotos })
		.from(questions)
		.where(and(eq(questions.id, place.questionId), eq(questions.testId, testId)))
		.limit(1)
	if (!question) return refused('slot_missing')
	const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
	if (typeMap[question.type]?.uiTemplate !== 'open') return refused('slot_missing')
	const window = await photoUploadWindow(executor, { sessionId: place.sessionId })
	if (!window) return refused('slot_missing')
	return {
		kind: 'slot',
		test: access.test,
		rule: { allowPhotos: question.allowPhotos, maxPhotos: question.maxPhotos },
		window,
	}
}

export async function placeOfSession(
	executor: UploadWindowExecutor,
	sessionId: string,
	questionId: string
): Promise<AnswerPhotoPlace | null> {
	const [row] = await executor
		.select({ testId: testSessions.testId, userId: testSessions.userId })
		.from(testSessions)
		.where(sessionFilter({ sessionId }))
		.limit(1)
	if (!row) return null
	return { owner: { testId: row.testId, userId: row.userId }, sessionId, questionId }
}
