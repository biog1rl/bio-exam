import {
	QuestionTypeScoringRuleSchema,
	isAutoScoredTemplate,
	isMistakeMetricAllowedForTemplate,
	type QuestionUiTemplate,
} from '@bio-exam/exam-core'

import { eq, type SQL } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../../db/index.js'
import { questions, tests, testScoringSettings } from '../../../db/schema.js'
import { getQuestionTypeMapForTest } from '../../../lib/tests/question-type-resolver.js'
import { TestScoringRulesSchema, createDefaultTestScoringRules } from '../../../lib/tests/scoring.js'
import { resolveQuestionPoints } from '../../../services/question-content/index.js'

export function validateScoringRuleTemplateCompatibility(params: {
	uiTemplate: QuestionUiTemplate
	scoringRule: z.infer<typeof QuestionTypeScoringRuleSchema>
}): string | null {
	if (!isAutoScoredTemplate(params.uiTemplate)) {
		return 'Баллы за открытый вопрос выставляет учитель: от 0 до 3'
	}
	if (!isMistakeMetricAllowedForTemplate(params.uiTemplate, params.scoringRule.mistakeMetric)) {
		return 'Способ подсчёта ошибок не подходит к формату ответа этого типа вопроса'
	}
	return null
}

export async function ensureGlobalScoringRules(updatedBy?: string | null) {
	const existing = await db.query.testScoringSettings.findFirst({
		where: eq(testScoringSettings.id, 'global'),
	})
	if (existing) {
		return TestScoringRulesSchema.parse(existing.rules)
	}

	const defaults = createDefaultTestScoringRules()
	await db
		.insert(testScoringSettings)
		.values({
			id: 'global',
			rules: defaults,
			updatedBy: updatedBy ?? null,
			updatedAt: new Date(),
		})
		.onConflictDoNothing()

	return defaults
}

export async function syncQuestionPointsForTestByTypeConfig(testId: string) {
	const typeMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
	const existingQuestions = await db
		.select({
			id: questions.id,
			type: questions.type,
			points: questions.points,
		})
		.from(questions)
		.where(eq(questions.testId, testId))

	for (const question of existingQuestions) {
		const points = resolveQuestionPoints({
			type: question.type,
			fallbackPoints: Number(question.points ?? 0),
			typeMap,
		})
		await db
			.update(questions)
			.set({
				points,
				updatedAt: new Date(),
			})
			.where(eq(questions.id, question.id))
	}
}

export async function syncQuestionPointsForTests(where?: SQL) {
	const rows = await db.select({ id: tests.id }).from(tests).where(where)
	for (const row of rows) {
		await syncQuestionPointsForTestByTypeConfig(row.id)
	}
}
