import { AnswerValueSchema, findAnswerViolation, type AnswerValue, type AnswerViolation } from '@bio-exam/exam-core'

import { eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions } from '../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'

export type DraftAnswerVerdict = { ok: true; value: AnswerValue } | { ok: false; violation: AnswerViolation }

export async function draftAnswerRule(
	testId: string
): Promise<(questionId: string, raw: unknown) => DraftAnswerVerdict> {
	const rows = await db
		.select({ id: questions.id, type: questions.type })
		.from(questions)
		.where(eq(questions.testId, testId))
	const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
	const templates = new Map(rows.map((row) => [row.id, typeMap[row.type]?.uiTemplate ?? null]))

	return (questionId, raw) => {
		const parsed = AnswerValueSchema.safeParse(raw)
		if (!parsed.success) return { ok: false, violation: { reason: 'answer_shape_invalid', questionId } }
		const violation = findAnswerViolation({
			answers: { [questionId]: parsed.data },
			questions: templates.has(questionId) ? [{ id: questionId, template: templates.get(questionId) ?? null }] : [],
		})
		return violation ? { ok: false, violation } : { ok: true, value: parsed.data }
	}
}
