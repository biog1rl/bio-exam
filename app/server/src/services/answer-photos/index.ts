import {
	ANSWER_PHOTO_MAX_COUNT,
	ANSWER_PHOTO_VARIANTS,
	type AnswerPhoto,
	type AnswerPhotoVariant,
	type UploadWindowRefusal,
} from '@bio-exam/exam-core'

import { and, asc, count, eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerPhotos, questions, testSessions } from '../../db/schema.js'
import { isUniqueViolation } from '../../lib/db-errors.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { acceptImage, IMAGE_PROFILES } from '../assets/index.js'
import {
	photoUploadWindow,
	sessionFilter,
	uploadWindowRefusal,
	type UploadWindowExecutor,
} from '../attempt-sessions/index.js'
import { storage } from '../storage/index.js'

export {
	OPEN_PHOTO_ABSENT_SQL,
	OPEN_TEXT_BLANK_SQL,
	emptyOpenQuestionIds,
	sessionHasPhotos,
} from './open-answer-rule.js'

export const ANSWER_PHOTO_NOT_FOUND = 'Фото не найдено'
export const ANSWER_PHOTO_TARGET_MISSING = 'Ответ для фото не найден'
export const ANSWER_PHOTO_CONFLICT = 'Это фото уже прикреплено к другому ответу'
export const FILE_MISSING = 'Файл не передан'

export type AnswerPhotoOwner = { testId: string; userId: string }

export type AnswerPhotoPlace = { owner: AnswerPhotoOwner; sessionId: string; questionId: string }

type WindowRefused = { kind: 'window'; status: 422; body: UploadWindowRefusal }

export type UploadOutcome =
	| { kind: 'created' | 'existing'; photo: AnswerPhoto; count: number }
	| WindowRefused
	| { kind: 'limit' }
	| { kind: 'conflict' }
	| { kind: 'missing' }

export type DeleteOutcome = { kind: 'deleted'; count: number } | WindowRefused | { kind: 'missing' }

type PhotoRow = { id: string; sessionId: string; questionId: string; uploadedAt: Date }

const PHOTO_COLUMNS = {
	id: answerPhotos.id,
	sessionId: answerPhotos.sessionId,
	questionId: answerPhotos.questionId,
	uploadedAt: answerPhotos.uploadedAt,
}

function answerPhotoKey(
	row: { sessionId: string; questionId: string; id: string },
	variant: AnswerPhotoVariant
): string {
	return `answers/${row.sessionId}/${row.questionId}/${row.id}/${variant}.webp`
}

function photoKeys(row: { sessionId: string; questionId: string; id: string }): string[] {
	return ANSWER_PHOTO_VARIANTS.map((variant) => answerPhotoKey(row, variant))
}

function toPhoto(row: PhotoRow): AnswerPhoto {
	return { id: row.id, questionId: row.questionId, uploadedAt: row.uploadedAt.toISOString() }
}

function sameAnswer(row: PhotoRow, place: AnswerPhotoPlace): boolean {
	return row.sessionId === place.sessionId && row.questionId === place.questionId
}

async function removeQuietly(keys: string[]): Promise<void> {
	if (keys.length === 0) return
	try {
		await storage().remove(keys)
	} catch (error) {
		console.warn('[answer-photos] orphan objects', keys, error)
	}
}

async function windowRefused(executor: UploadWindowExecutor, sessionId: string): Promise<WindowRefused | null> {
	const state = await photoUploadWindow(executor, { sessionId })
	if (state === null) return null
	const refusal = uploadWindowRefusal(state)
	return refusal ? { kind: 'window', ...refusal } : null
}

async function findPhotoRow(executor: UploadWindowExecutor, photoId: string): Promise<PhotoRow | null> {
	const [row] = await executor.select(PHOTO_COLUMNS).from(answerPhotos).where(eq(answerPhotos.id, photoId)).limit(1)
	return row ?? null
}

async function countPhotos(executor: UploadWindowExecutor, place: AnswerPhotoPlace): Promise<number> {
	const [row] = await executor
		.select({ value: count() })
		.from(answerPhotos)
		.where(and(eq(answerPhotos.sessionId, place.sessionId), eq(answerPhotos.questionId, place.questionId)))
	return row?.value ?? 0
}

export async function findPhotoTarget(place: AnswerPhotoPlace): Promise<boolean> {
	const [session] = await db
		.select({ id: testSessions.id })
		.from(testSessions)
		.where(sessionFilter({ sessionId: place.sessionId, owner: place.owner }))
		.limit(1)
	if (!session) return false
	const [question] = await db
		.select({ type: questions.type })
		.from(questions)
		.where(and(eq(questions.id, place.questionId), eq(questions.testId, place.owner.testId)))
		.limit(1)
	if (!question) return false
	const typeMap = await getQuestionTypeMapForTest({ testId: place.owner.testId, includeInactive: true })
	return typeMap[question.type]?.uiTemplate === 'open'
}

export async function uploadAnswerPhoto(
	place: AnswerPhotoPlace,
	photoId: string,
	buffer: Buffer
): Promise<UploadOutcome> {
	const known = await findPhotoRow(db, photoId)
	if (known) {
		if (!sameAnswer(known, place)) return { kind: 'conflict' }
		return { kind: 'existing', photo: toPhoto(known), count: await countPhotos(db, place) }
	}
	const early = await windowRefused(db, place.sessionId)
	if (early) return early

	const accepted = await acceptImage(buffer, IMAGE_PROFILES.answerPhoto)
	const target = { sessionId: place.sessionId, questionId: place.questionId, id: photoId }
	const files: Array<[AnswerPhotoVariant, Buffer | null]> = [
		['full', accepted.full],
		['thumb', accepted.thumb],
	]
	const written: string[] = []
	let outcome: UploadOutcome
	try {
		for (const [variant, data] of files) {
			if (data === null) continue
			const key = answerPhotoKey(target, variant)
			await storage().write(key, data, { contentType: accepted.mime, upsert: true })
			written.push(key)
		}
		outcome = await db.transaction(async (tx): Promise<UploadOutcome> => {
			const [session] = await tx
				.select({ id: testSessions.id, attemptId: testSessions.attemptId })
				.from(testSessions)
				.where(sessionFilter({ sessionId: place.sessionId, owner: place.owner }))
				.for('update')
			if (!session) return { kind: 'missing' }
			const refused = await windowRefused(tx, place.sessionId)
			if (refused) return refused
			const row = await findPhotoRow(tx, photoId)
			if (row) {
				if (!sameAnswer(row, place)) return { kind: 'conflict' }
				return { kind: 'existing', photo: toPhoto(row), count: await countPhotos(tx, place) }
			}
			const current = await countPhotos(tx, place)
			if (current >= ANSWER_PHOTO_MAX_COUNT) return { kind: 'limit' }
			const [inserted] = await tx
				.insert(answerPhotos)
				.values({
					id: photoId,
					sessionId: place.sessionId,
					questionId: place.questionId,
					attemptId: session.attemptId,
				})
				.returning(PHOTO_COLUMNS)
			if (!inserted) throw new Error('uploadAnswerPhoto: строка фото не вставлена')
			return { kind: 'created', photo: toPhoto(inserted), count: current + 1 }
		})
	} catch (error) {
		await removeQuietly(written)
		if (isUniqueViolation(error)) return { kind: 'conflict' }
		throw error
	}
	if (outcome.kind !== 'created' && outcome.kind !== 'existing') await removeQuietly(written)
	return outcome
}

export async function listAnswerPhotos(place: AnswerPhotoPlace): Promise<AnswerPhoto[] | null> {
	if (!(await findPhotoTarget(place))) return null
	const rows = await db
		.select(PHOTO_COLUMNS)
		.from(answerPhotos)
		.where(and(eq(answerPhotos.sessionId, place.sessionId), eq(answerPhotos.questionId, place.questionId)))
		.orderBy(asc(answerPhotos.uploadedAt), asc(answerPhotos.id))
	return rows.map(toPhoto)
}

export async function deleteAnswerPhoto(place: AnswerPhotoPlace, photoId: string): Promise<DeleteOutcome> {
	const outcome = await db.transaction(async (tx): Promise<DeleteOutcome & { row?: PhotoRow }> => {
		const [session] = await tx
			.select({ id: testSessions.id })
			.from(testSessions)
			.where(sessionFilter({ sessionId: place.sessionId, owner: place.owner }))
			.for('update')
		if (!session) return { kind: 'missing' }
		const refused = await windowRefused(tx, place.sessionId)
		if (refused) return refused
		const [deleted] = await tx
			.delete(answerPhotos)
			.where(
				and(
					eq(answerPhotos.id, photoId),
					eq(answerPhotos.sessionId, place.sessionId),
					eq(answerPhotos.questionId, place.questionId)
				)
			)
			.returning(PHOTO_COLUMNS)
		if (!deleted) return { kind: 'missing' }
		return { kind: 'deleted', count: await countPhotos(tx, place), row: deleted }
	})
	if (outcome.kind !== 'deleted') return outcome
	if (outcome.row) await removeQuietly(photoKeys(outcome.row))
	return { kind: 'deleted', count: outcome.count }
}

export async function readAnswerPhotoFile(photoId: string, variant: AnswerPhotoVariant): Promise<Buffer | null> {
	const row = await findPhotoRow(db, photoId)
	if (!row) return null
	const file = await storage().read(answerPhotoKey(row, variant))
	return file?.data ?? null
}

export async function removeUserAnswerPhotos(userId: string): Promise<number> {
	const rows = await db
		.select({ id: answerPhotos.id, sessionId: answerPhotos.sessionId, questionId: answerPhotos.questionId })
		.from(answerPhotos)
		.innerJoin(testSessions, eq(testSessions.id, answerPhotos.sessionId))
		.where(eq(testSessions.userId, userId))
	const keys = rows.flatMap(photoKeys)
	if (keys.length > 0) await storage().remove(keys)
	return rows.length
}
