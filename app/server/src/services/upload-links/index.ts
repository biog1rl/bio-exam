import type { UploadLinkContext, UploadLinkIssueResponse, UploadWindowRefusal } from '@bio-exam/exam-core'

import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'

import { db } from '../../db/index.js'
import { answerUploadLinks, questions, testSessions } from '../../db/schema.js'
import {
	placeOfSession,
	readPhotoRule,
	readPhotoSlot,
	type AnswerPhotoPlace,
	type PhotoSlotRefusal,
} from '../answer-photos/index.js'
import {
	databaseNow,
	photoUploadWindow,
	sessionFilter,
	uploadWindowRefusal,
	type UploadWindowState,
} from '../attempt-sessions/index.js'
import { questionMarkdownCandidates, readQuestionTexts } from '../question-content/index.js'

export const UPLOAD_LINKS_PER_SLOT = 3

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type UploadScope = { linkId: string; sessionId: string; questionId: string }

type WindowRefused = { kind: 'window'; status: 422; body: UploadWindowRefusal }

export type IssueUploadLinkOutcome =
	| { kind: 'issued'; link: UploadLinkIssueResponse }
	| { kind: 'refused'; reason: PhotoSlotRefusal }
	| WindowRefused
	| { kind: 'forbidden' }

export type ResolvedUploadLink = UploadScope & { place: AnswerPhotoPlace; issuedBeforeSubmit: boolean }

export type UploadLinkState = { kind: 'invalid' } | WindowRefused | { kind: 'live'; scope: UploadScope }

type TouchLog = { warn: (payload: object, message: string) => void }

const INVALID: UploadLinkState = { kind: 'invalid' }

function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

function refusedWindow(state: UploadWindowState): WindowRefused | null {
	const refusal = uploadWindowRefusal(state)
	return refusal ? { kind: 'window', ...refusal } : null
}

function isoOrNull(value: Date | null): string | null {
	return value ? value.toISOString() : null
}

export async function issueUploadLink(place: AnswerPhotoPlace): Promise<IssueUploadLinkOutcome> {
	const slot = await readPhotoSlot(db, place)
	if (slot.kind === 'refused') return slot
	const early = refusedWindow(slot.window)
	if (early) return early
	if (!slot.rule.allowPhotos) return { kind: 'forbidden' }
	const token = randomBytes(32).toString('base64url')
	return db.transaction(async (tx): Promise<IssueUploadLinkOutcome> => {
		const [session] = await tx
			.select({ id: testSessions.id })
			.from(testSessions)
			.where(sessionFilter({ sessionId: place.sessionId, owner: place.owner }))
			.for('update')
		if (!session) return { kind: 'refused', reason: 'slot_missing' }
		const window = await photoUploadWindow(tx, { sessionId: place.sessionId })
		if (!window) return { kind: 'refused', reason: 'slot_missing' }
		const refused = refusedWindow(window)
		if (refused) return refused
		const rule = await readPhotoRule(tx, place.questionId)
		if (!rule) return { kind: 'refused', reason: 'slot_missing' }
		if (!rule.allowPhotos) return { kind: 'forbidden' }
		const active = await tx
			.select({ id: answerUploadLinks.id })
			.from(answerUploadLinks)
			.where(
				and(
					eq(answerUploadLinks.sessionId, place.sessionId),
					eq(answerUploadLinks.questionId, place.questionId),
					isNull(answerUploadLinks.revokedAt)
				)
			)
			.orderBy(asc(answerUploadLinks.createdAt), asc(answerUploadLinks.id))
		const stale = active.slice(0, Math.max(0, active.length - (UPLOAD_LINKS_PER_SLOT - 1)))
		if (stale.length > 0) {
			await tx
				.update(answerUploadLinks)
				.set({ revokedAt: sql`now()` })
				.where(
					inArray(
						answerUploadLinks.id,
						stale.map((row) => row.id)
					)
				)
		}
		const [created] = await tx
			.insert(answerUploadLinks)
			.values({ sessionId: place.sessionId, questionId: place.questionId, tokenHash: sha256Hex(token) })
			.returning({ serverNow: sql<string>`clock_timestamp()` })
		if (!created) throw new Error('issueUploadLink: ссылка не создана')
		return {
			kind: 'issued',
			link: {
				token,
				uploadClosesAt: isoOrNull(window.closesAt),
				serverNow: new Date(created.serverNow).toISOString(),
			},
		}
	})
}

export async function resolveUploadLink(token: unknown): Promise<ResolvedUploadLink | null> {
	if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null
	const [row] = await db
		.select({
			linkId: answerUploadLinks.id,
			sessionId: answerUploadLinks.sessionId,
			questionId: answerUploadLinks.questionId,
			testId: testSessions.testId,
			userId: testSessions.userId,
			issuedBeforeSubmit: sql<boolean>`(${testSessions.submittedAt} IS NOT NULL AND ${answerUploadLinks.createdAt} < ${testSessions.submittedAt})`,
		})
		.from(answerUploadLinks)
		.innerJoin(testSessions, eq(testSessions.id, answerUploadLinks.sessionId))
		.where(
			and(
				eq(answerUploadLinks.tokenHash, sha256Hex(token)),
				isNull(answerUploadLinks.revokedAt),
				sql`${answerUploadLinks.createdAt} > now() - interval '24 hours'`
			)
		)
		.limit(1)
	if (!row) return null
	return {
		linkId: row.linkId,
		sessionId: row.sessionId,
		questionId: row.questionId,
		place: {
			owner: { testId: row.testId, userId: row.userId },
			sessionId: row.sessionId,
			questionId: row.questionId,
		},
		issuedBeforeSubmit: row.issuedBeforeSubmit === true,
	}
}

export async function uploadLinkSlot(link: ResolvedUploadLink): Promise<UploadLinkState> {
	if (link.issuedBeforeSubmit) return INVALID
	const slot = await readPhotoSlot(db, link.place)
	if (slot.kind === 'refused') return INVALID
	if (!slot.window.open && slot.window.reason === 'session_closed') return INVALID
	const refused = refusedWindow(slot.window)
	if (refused) return refused
	return { kind: 'live', scope: { linkId: link.linkId, sessionId: link.sessionId, questionId: link.questionId } }
}

export function placeOfUploadScope(scope: UploadScope): Promise<AnswerPhotoPlace | null> {
	return placeOfSession(db, scope.sessionId, scope.questionId)
}

export async function readUploadContext(scope: UploadScope): Promise<UploadLinkContext | null> {
	const place = await placeOfUploadScope(scope)
	if (!place) return null
	const slot = await readPhotoSlot(db, place)
	if (slot.kind !== 'slot') return null
	const rows = await db
		.select({ id: questions.id, promptPath: questions.promptPath })
		.from(questions)
		.where(eq(questions.testId, slot.test.id))
		.orderBy(asc(questions.order))
	const index = rows.findIndex((row) => row.id === scope.questionId)
	const row = rows[index]
	if (!row) return null
	const [promptText = ''] = await readQuestionTexts([
		{
			candidates: questionMarkdownCandidates({
				storedPath: row.promptPath,
				topicSlug: slot.test.topicSlug,
				testSlug: slot.test.slug,
				testId: slot.test.id,
				questionId: row.id,
				fileName: 'prompt.md',
			}),
		},
	])
	return {
		testTitle: slot.test.title,
		questionNumber: index + 1,
		promptText,
		allowPhotos: slot.rule.allowPhotos,
		maxPhotos: slot.rule.maxPhotos,
		uploadClosesAt: isoOrNull(slot.window.closesAt),
		serverNow: new Date(await databaseNow()).toISOString(),
	}
}

export async function touchUploadLink(linkId: string, log: TouchLog): Promise<void> {
	try {
		await db
			.update(answerUploadLinks)
			.set({ lastUsedAt: sql`now()` })
			.where(
				and(
					eq(answerUploadLinks.id, linkId),
					or(isNull(answerUploadLinks.lastUsedAt), lt(answerUploadLinks.lastUsedAt, sql`now() - interval '30 seconds'`))
				)
			)
	} catch (error) {
		log.warn({ err: error, linkId }, 'upload link touch failed')
	}
}
