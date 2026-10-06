import { asc, eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { questions } from '../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { questionMarkdownCandidates, readQuestionTexts } from '../../services/question-content/index.js'

export type StudentQuestionRow = {
	id: string
	type: string
	order: number
	points: number
	options: unknown
	matchingPairs: unknown
}

export type StudentQuestionTypeConfig = {
	uiTemplate: string
	title: string
}

export function studentQuestionView(
	row: StudentQuestionRow,
	typeConfig: StudentQuestionTypeConfig,
	promptText: string
) {
	return {
		id: row.id,
		type: row.type,
		questionUiTemplate: typeConfig.uiTemplate,
		questionTypeTitle: typeConfig.title,
		order: row.order,
		points: row.points,
		options: row.options,
		matchingPairs: row.matchingPairs,
		promptText,
	}
}

export async function readStudentQuestions(test: { id: string; slug: string; topicSlug: string }) {
	const rows = await db
		.select({
			id: questions.id,
			type: questions.type,
			order: questions.order,
			points: questions.points,
			options: questions.options,
			matchingPairs: questions.matchingPairs,
			promptPath: questions.promptPath,
		})
		.from(questions)
		.where(eq(questions.testId, test.id))
		.orderBy(asc(questions.order))
	const types = await getQuestionTypeMapForTest({ testId: test.id, includeInactive: true })
	const promptTexts = await readQuestionTexts(
		rows.map((row) => ({
			candidates: questionMarkdownCandidates({
				storedPath: row.promptPath,
				topicSlug: test.topicSlug,
				testSlug: test.slug,
				testId: test.id,
				questionId: row.id,
				fileName: 'prompt.md',
			}),
		}))
	)
	return rows.map((row, index) => {
		const typeConfig = types[row.type]
		if (!typeConfig) throw new Error(`Question type is not configured: ${row.type}`)
		return studentQuestionView(row, typeConfig, promptTexts[index] ?? '')
	})
}
