import { isAnswered } from '@bio-exam/exam-core'

import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm'

import type { DB } from '../../db/index.js'
import { answerPhotos, questions } from '../../db/schema.js'

type Executor = Pick<DB, 'select' | 'selectDistinct'>

export type OpenAnswerPlace = { sessionId?: string | null; attemptId?: string | null }

const BLANK_TEXT_PATTERN = '^[\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]*$'

export async function sessionHasPhotos(executor: Executor, sessionId: string): Promise<boolean> {
	const [row] = await executor
		.select({ id: answerPhotos.id })
		.from(answerPhotos)
		.where(eq(answerPhotos.sessionId, sessionId))
		.limit(1)
	return row !== undefined
}

export function photoOwnership(place: OpenAnswerPlace): SQL | undefined {
	const ownership: SQL[] = []
	if (place.sessionId) ownership.push(eq(answerPhotos.sessionId, place.sessionId))
	if (place.attemptId) ownership.push(eq(answerPhotos.attemptId, place.attemptId))
	return or(...ownership)
}

async function photographedQuestionIds(
	executor: Executor,
	place: OpenAnswerPlace,
	questionIds: readonly string[]
): Promise<Set<string>> {
	const ownership = photoOwnership(place)
	if (!ownership) return new Set()
	const rows = await executor
		.selectDistinct({ questionId: answerPhotos.questionId })
		.from(answerPhotos)
		.where(and(inArray(answerPhotos.questionId, [...questionIds]), ownership))
	return new Set(rows.map((row) => row.questionId))
}

export async function emptyOpenQuestionIds(
	executor: Executor,
	input: OpenAnswerPlace & { answers: Readonly<Record<string, unknown>> }
): Promise<string[]> {
	const textless = Object.entries(input.answers)
		.filter(([, answer]) => !isAnswered({ template: 'open', answer }))
		.map(([questionId]) => questionId)
	if (textless.length === 0) return []
	const photographed = await photographedQuestionIds(executor, input, textless)
	return textless.filter((questionId) => !photographed.has(questionId))
}

export async function clientSubmitOpenRule(
	executor: Executor,
	input: { sessionId: string; windowMinutes: number; answers: Readonly<Record<string, unknown>> }
): Promise<{ emptyQuestionIds: string[]; needsWindow: boolean }> {
	const questionIds = Object.keys(input.answers)
	if (questionIds.length === 0) return { emptyQuestionIds: [], needsWindow: false }
	const rows = await executor
		.select({ id: questions.id, allowPhotos: questions.allowPhotos })
		.from(questions)
		.where(inArray(questions.id, questionIds))
	const allowed = new Map(rows.map((row) => [row.id, row.allowPhotos]))
	const photographed = await photographedQuestionIds(executor, { sessionId: input.sessionId }, questionIds)
	const emptyQuestionIds: string[] = []
	let needsWindow = false
	for (const questionId of questionIds) {
		const canAddPhotos = input.windowMinutes > 0 && allowed.get(questionId) === true
		const hasPhoto = photographed.has(questionId)
		if (!hasPhoto && !isAnswered({ template: 'open', answer: input.answers[questionId] }) && !canAddPhotos) {
			emptyQuestionIds.push(questionId)
		}
		if (canAddPhotos && !hasPhoto) needsWindow = true
	}
	return { emptyQuestionIds, needsWindow }
}

export const OPEN_TEXT_BLANK_SQL: SQL = sql`(jsonb_typeof(f.item -> 'userAnswer') is distinct from 'string' or (f.item ->> 'userAnswer') ~ ${BLANK_TEXT_PATTERN})`

export const OPEN_PHOTO_ABSENT_SQL: SQL = sql`not exists (
	select 1 from answer_photos p
	where p.question_id = (f.item ->> 'questionId')::uuid
		and (p.attempt_id = ta.id or (ta.session_id is not null and p.session_id = ta.session_id))
)`
